// Two-level cache for Excalidraw BinaryFileData, keyed by fileId.
// L1: in-memory Map (synchronous). L2: IndexedDB (survives reloads).
// Icon fileIds are content hashes (see iconFileId), so identical icons across
// diagrams/tabs share one entry and hydrate without any network round-trip.

const DB_NAME = "sketchizi-binary-files";
const STORE = "files";
const memory = new Map();
let dbPromise = null;

const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    let request;
    try { request = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
};

export const isUsableFile = (file) =>
  Boolean(file) && typeof file === "object" && typeof file.dataURL === "string" && file.dataURL.length > 0;

// Strictly the BinaryFileData shape Excalidraw expects.
export function toBinaryFileData(fileId, file) {
  return {
    id: fileId,
    dataURL: file.dataURL,
    mimeType: file.mimeType || "image/svg+xml",
    created: Number.isFinite(file.created) ? file.created : Date.now(),
    lastRetrieved: Date.now(),
  };
}

export function getCachedFileSync(fileId) {
  return memory.get(fileId) || null;
}

export function putCachedFiles(files) {
  const entries = Object.entries(files || {}).filter(([, file]) => isUsableFile(file));
  if (!entries.length) return Promise.resolve();
  const normalized = entries.map(([id, file]) => [id, toBinaryFileData(file.id || id, file)]);
  normalized.forEach(([id, file]) => memory.set(id, file));
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) { resolve(); return; }
    try {
      const tx = db.transaction(STORE, "readwrite");
      normalized.forEach(([id, file]) => tx.objectStore(STORE).put(file, id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  }));
}

export function getCachedFiles(fileIds) {
  const result = {};
  const missing = [];
  for (const id of fileIds) {
    const hit = memory.get(id);
    if (hit) result[id] = hit; else missing.push(id);
  }
  if (!missing.length) return Promise.resolve(result);
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) { resolve(result); return; }
    try {
      const tx = db.transaction(STORE, "readonly");
      missing.forEach((id) => {
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => {
          if (isUsableFile(req.result)) { memory.set(id, req.result); result[id] = req.result; }
        };
      });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => resolve(result);
      tx.onabort = () => resolve(result);
    } catch { resolve(result); }
  }));
}

export const referencedImageFileIds = (elements) => [...new Set(
  (elements || [])
    .filter((el) => el && el.type === "image" && !el.isDeleted && typeof el.fileId === "string" && el.fileId)
    .map((el) => el.fileId),
)];

/**
 * Atomic hydration: given the document's elements and files, register every
 * file with Excalidraw (via `addFiles`) and return the elements with
 * `status: "saved"` for those whose file is present. Call this BEFORE
 * `updateScene({ elements })` so the first paint already has the images.
 * Files embedded in the document win; the local cache fills any gaps
 * (synchronously from L1 where possible).
 */
export function hydrateFilesSync(api, elements, documentFiles = {}) {
  const ids = referencedImageFileIds(elements);
  const resolved = {};
  for (const id of ids) {
    const embedded = documentFiles?.[id];
    if (isUsableFile(embedded)) resolved[id] = toBinaryFileData(id, embedded);
    else {
      const cached = getCachedFileSync(id);
      if (cached) resolved[id] = toBinaryFileData(id, cached);
    }
  }
  // Also register embedded files not referenced by live images (harmless, keeps
  // undo/redo of deleted images working).
  for (const [id, file] of Object.entries(documentFiles || {})) {
    if (!resolved[id] && isUsableFile(file)) resolved[id] = toBinaryFileData(file.id || id, file);
  }
  const list = Object.values(resolved);
  if (list.length) api?.addFiles?.(list);
  putCachedFiles(resolved).catch(() => {});
  const nextElements = (elements || []).map((el) =>
    el && el.type === "image" && !el.isDeleted && resolved[el.fileId] && el.status !== "saved"
      ? { ...el, status: "saved" }
      : el);
  const missing = ids.filter((id) => !resolved[id]);
  return { elements: nextElements, files: resolved, missing };
}

/** Async L2 fill for ids still missing after the sync pass (IndexedDB read). */
export async function hydrateMissingFromCache(api, missingIds) {
  if (!missingIds?.length) return {};
  const found = await getCachedFiles(missingIds);
  const list = Object.entries(found).map(([id, file]) => toBinaryFileData(id, file));
  if (list.length) api?.addFiles?.(list);
  return found;
}

// Deterministic content-hash id (FNV-1a 64-bit via two 32-bit lanes) so the
// same SVG always yields the same fileId across diagrams.
export function contentFileId(prefix, text) {
  let h1 = 0x811c9dc5; let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${prefix}-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
