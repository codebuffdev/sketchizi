import { normalizeCloudDiagramResponse } from "./cloudDiagramPayload.js";

const KB = 1024;
const MB = 1024 * 1024;
/** "512 B", "248 KB", "1.42 MB" (binary units; MB keeps two decimals, trailing zeros dropped). */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= MB) return `${Number((value / MB).toFixed(2))} MB`;
  if (value >= KB) return `${Math.round(value / KB)} KB`;
  return `${Math.round(value)} B`;
}

/** Portable-footprint limit shown to every account (admins are unlimited in the cloud, but files still travel). */
export const DIAGRAM_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;

function utf8Length(text) {
  if (encoder) return encoder.encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

/** Exact UTF-8 size of the serialized { elements, appState, files } payload. Null when unknown. */
export function computeDocumentBytes(document) {
  if (typeof document === "string") return utf8Length(document);
  if (!document || typeof document !== "object") return null;
  try {
    const text = JSON.stringify({ elements: document.elements || [], appState: document.appState || {}, files: document.files || {} });
    return typeof Blob === "function" ? new Blob([text]).size : utf8Length(text);
  } catch { return null; }
}

const validBytes = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" && Number(value) >= 0 ? Number(value) : null);

const SIZE_CACHE_KEY = "sketchizi.workspace.sizes.v1";
export function readSizeCache(storage = globalThis.localStorage) {
  try { const parsed = JSON.parse(storage?.getItem(SIZE_CACHE_KEY) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
export function writeSizeCache(sizes, storage = globalThis.localStorage) {
  try { storage?.setItem(SIZE_CACHE_KEY, JSON.stringify({ ...readSizeCache(storage), ...sizes })); } catch { /* optional cache */ }
}

/**
 * Size for a diagram row, cheapest source first so the list renders instantly:
 * stored record size (row.sizeBytes / document.metadata.sizeBytes), then a
 * measurement of an already-loaded document, then the local size cache.
 */
export function getDiagramBytes(diagram, cache = null) {
  const stored = validBytes(diagram?.sizeBytes) ?? validBytes(diagram?.size_bytes) ?? validBytes(diagram?.document?.metadata?.sizeBytes);
  if (stored !== null) return stored;
  const measured = computeDocumentBytes(diagram?.document);
  if (measured !== null) return measured;
  return validBytes(cache?.[diagram?.id]);
}

export function sumBytes(values) {
  let total = 0; let known = false;
  for (const value of values) if (Number.isFinite(value)) { total += value; known = true; }
  return known ? total : null;
}

/** "heavy" (>= 2 MB), "ok", or "unknown". */
export function getSizeState(bytes, limit = DIAGRAM_SIZE_LIMIT_BYTES) {
  if (!Number.isFinite(bytes)) return "unknown";
  return bytes >= limit ? "heavy" : "ok";
}

export function slugifyTitle(title) {
  const slug = String(title ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return slug.slice(0, 80) || "diagram";
}

export const downloadFilename = (title) => `${slugifyTitle(title)}.sketchizi.json`;

/** Full, Excalidraw-compatible payload: elements, appState, embedded files and metadata. */
export function buildDownloadPayload(diagram, document) {
  return {
    type: "excalidraw",
    version: 2,
    source: "sketchizi",
    name: diagram?.name || "",
    elements: Array.isArray(document?.elements) ? document.elements : [],
    appState: document?.appState || {},
    files: document?.files || {},
    metadata: { ...(document?.metadata || {}), sizeBytes: computeDocumentBytes(document) ?? undefined },
    extensions: document?.extensions || {},
    format: document?.format || diagram?.format || "excalidraw",
  };
}

export function triggerJsonDownload(filename, payload) {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement("a");
  link.href = url; link.download = filename; link.rel = "noopener";
  globalThis.document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob.size;
}

/** Use an already-loaded full document when the row has one, otherwise fetch it from cloud storage. */
export async function loadFullDocument(diagram, fetchDiagram) {
  const cached = diagram?.document;
  if (cached && typeof cached === "object" && Array.isArray(cached.elements) && cached.files && typeof cached.files === "object") {
    return { document: cached, name: diagram.name };
  }
  const { document, name } = normalizeCloudDiagramResponse(await fetchDiagram(diagram.id), diagram.id, { fallbackName: diagram.name });
  return { document, name };
}
