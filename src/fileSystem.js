// File/folder based Open & Save for Sketchizi drawings.
//
// Format: the standard Excalidraw JSON scene (`type: "excalidraw"`), saved
// with the `.excalidraw` extension (already used by the recovery download).
// Files therefore also open in excalidraw.com and vice versa.
//
// APIs:
//   showOpenFilePicker()  - native Open dialog (browse any folder), returns a
//                           persistent FileSystemFileHandle.
//   showSaveFilePicker()  - native "Save as" dialog (choose folder + name).
//   handle.createWritable() / handle.getFile() - read/write the same file again.
//   handle.queryPermission()/requestPermission() - permissions do not survive a
//                           reload, so they are re-checked before every use.
// showDirectoryPicker() is used only for the explicit "Open folder" workflow.
// File and directory handles are persisted by the existing IndexedDB layer.
// Fallback (Firefox/Safari): <input type="file"> for Open, download for Save.

export const DRAWING_EXTENSION = ".excalidraw";
const DRAWING_MIME = "application/vnd.excalidraw+json";
const SOURCE = "https://sketchizi.pages.dev";

export class DrawingFileError extends Error {
  constructor(message, kind = "unknown", cause = null) {
    super(message);
    this.name = "DrawingFileError";
    this.kind = kind; // "cancelled" | "permission" | "not-found" | "invalid" | "unknown"
    this.cause = cause;
  }
}

export function getFileSystemSupport() {
  const w = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});
  return {
    open: typeof w.showOpenFilePicker === "function",
    save: typeof w.showSaveFilePicker === "function",
    directory: typeof w.showDirectoryPicker === "function",
  };
}

const PICKER_TYPES = [
  {
    description: "Sketchizi drawing",
    accept: { [DRAWING_MIME]: [DRAWING_EXTENSION], "application/json": [".json"] },
  },
];
const SAVE_PICKER_TYPES = [
  { description: "Sketchizi drawing", accept: { [DRAWING_MIME]: [DRAWING_EXTENSION] } },
];

export function ensureExtension(name) {
  const base = String(name || "").trim() || "Untitled drawing";
  return /\.(excalidraw|json)$/i.test(base) ? base : `${base}${DRAWING_EXTENSION}`;
}

export function displayName(name) {
  return String(name || "Untitled drawing").replace(/\.(excalidraw|json)$/i, "");
}

// ---- serialization --------------------------------------------------------

export function serializeDrawing({ elements, appState, files }) {
  const liveElements = (elements || []).filter((element) => !element.isDeleted);
  // Persist only binary files still referenced by live image elements.
  const usedFileIds = new Set(
    liveElements.filter((element) => element.type === "image" && element.fileId).map((element) => element.fileId)
  );
  const savedFiles = {};
  Object.entries(files || {}).forEach(([id, file]) => {
    if (usedFileIds.has(id) || usedFileIds.has(file?.id)) savedFiles[id] = file;
  });

  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: SOURCE,
      elements: liveElements,
      appState: {
        viewBackgroundColor: appState?.viewBackgroundColor,
        scrollX: appState?.scrollX || 0,
        scrollY: appState?.scrollY || 0,
        zoom: { value: appState?.zoom?.value || 1 },
        gridModeEnabled: !!appState?.gridModeEnabled,
        gridSize: appState?.gridSize,
        gridStep: appState?.gridStep,
      },
      files: savedFiles,
    },
    null,
    2
  );
}

export function parseDrawing(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DrawingFileError("This file is not a valid drawing (not JSON).", "invalid", error);
  }
  if (!data || typeof data !== "object" || data.type !== "excalidraw" || !Array.isArray(data.elements)) {
    throw new DrawingFileError("This file is not a Sketchizi/Excalidraw drawing.", "invalid");
  }
  const elements = data.elements.filter(
    (element) => element && typeof element === "object" && typeof element.id === "string" && typeof element.type === "string"
  );
  const files = {};
  if (data.files && typeof data.files === "object") {
    Object.entries(data.files).forEach(([id, file]) => {
      if (file && typeof file.dataURL === "string" && typeof file.mimeType === "string") {
        files[id] = { ...file, id: file.id || id };
      }
    });
  }
  const saved = data.appState && typeof data.appState === "object" ? data.appState : {};
  const appState = {
    viewBackgroundColor: typeof saved.viewBackgroundColor === "string" ? saved.viewBackgroundColor : undefined,
    scrollX: Number.isFinite(saved.scrollX) ? saved.scrollX : 0,
    scrollY: Number.isFinite(saved.scrollY) ? saved.scrollY : 0,
    zoom: { value: Number(saved.zoom?.value ?? saved.zoom) > 0 ? Number(saved.zoom?.value ?? saved.zoom) : 1 },
    gridModeEnabled: !!saved.gridModeEnabled,
    gridSize: saved.gridSize,
    gridStep: saved.gridStep,
  };
  if (appState.viewBackgroundColor === undefined) delete appState.viewBackgroundColor;
  if (appState.gridSize === undefined) delete appState.gridSize;
  if (appState.gridStep === undefined) delete appState.gridStep;
  return { elements, appState, files };
}

// ---- errors ---------------------------------------------------------------

export function normalizeFsError(error, fallback) {
  if (error instanceof DrawingFileError) return error;
  const name = error?.name || "";
  if (name === "AbortError") return new DrawingFileError("Cancelled", "cancelled", error);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new DrawingFileError("File permission was denied", "permission", error);
  }
  if (name === "NotFoundError") {
    return new DrawingFileError("The file is no longer accessible", "not-found", error);
  }
  return new DrawingFileError(fallback, "unknown", error);
}

// ---- handles --------------------------------------------------------------

export async function ensureHandlePermission(handle, mode = "readwrite") {
  if (!handle) return false;
  const options = { mode };
  try {
    if (typeof handle.queryPermission === "function") {
      if ((await handle.queryPermission(options)) === "granted") return true;
    } else {
      return true;
    }
    if (typeof handle.requestPermission === "function") {
      return (await handle.requestPermission(options)) === "granted";
    }
  } catch {
    return false;
  }
  return false;
}

export async function readDrawingFromHandle(handle) {
  try {
    const file = await handle.getFile();
    return { name: file.name, text: await file.text() };
  } catch (error) {
    throw normalizeFsError(error, "Unable to open drawing");
  }
}

export async function writeDrawingToHandle(handle, text) {
  let writable;
  try {
    writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (error) {
    try { await writable?.abort?.(); } catch {}
    throw normalizeFsError(error, "Unable to save drawing");
  }
}

export async function pickDrawingToOpen() {
  try {
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: PICKER_TYPES });
    return handle;
  } catch (error) {
    throw normalizeFsError(error, "Unable to open drawing");
  }
}

export async function pickDrawingToSave(suggestedName, startIn = null) {
  try {
    const options = {
      suggestedName: ensureExtension(suggestedName),
      types: SAVE_PICKER_TYPES,
    };
    if (startIn) options.startIn = startIn;
    return await window.showSaveFilePicker(options);
  } catch (error) {
    throw normalizeFsError(error, "Unable to save drawing");
  }
}


export function getDirectoryPickerStatus() {
  const w = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});
  const apiAvailable = typeof w.showDirectoryPicker === "function";
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext !== false;
  const framed = typeof window !== "undefined" && window.top !== window.self;
  let reason = "available";
  if (!apiAvailable) {
    if (!secureContext) reason = "insecure-context";
    else if (framed) reason = "embedded-context";
    else reason = "api-unavailable";
  }
  return { apiAvailable, secureContext, framed, reason };
}

export async function pickDirectoryToOpen() {
  try {
    const status = getDirectoryPickerStatus();
    if (!status.apiAvailable) {
      throw new DrawingFileError(
        status.reason === "insecure-context"
          ? "Folder access is unavailable because this page is not running in a secure context."
          : status.reason === "embedded-context"
            ? "Folder access is unavailable in this embedded browser context."
            : "Folder access is unavailable in this browser context.",
        "unsupported",
      );
    }
    return await globalThis.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    throw normalizeFsError(error, "Unable to open folder");
  }
}

export function pickDirectoryViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.webkitdirectory = true;
    input.setAttribute("directory", "");
    input.style.display = "none";
    const cleanup = () => input.remove();
    const finish = (error, value) => { cleanup(); error ? reject(error) : resolve(value); };
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) { finish(new DrawingFileError("Cancelled", "cancelled")); return; }
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const rootName = firstPath.split("/")[0] || "Selected folder";
      finish(null, {
        name: rootName,
        handle: null,
        files,
        fallback: true,
      });
    });
    input.addEventListener("cancel", () => finish(new DrawingFileError("Cancelled", "cancelled")));
    document.body.appendChild(input);
    input.click();
  });
}

export async function listDrawingFiles(directoryHandle) {
  if (!directoryHandle) return [];
  try {
    const files = [];
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle?.kind !== "file" || !/\.excalidraw$/i.test(name)) continue;
      files.push({ name, handle });
    }
    return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } catch (error) {
    throw normalizeFsError(error, "Unable to read the selected folder");
  }
}

export async function createDrawingInDirectory(directoryHandle, name, text) {
  try {
    const filename = ensureExtension(name);
    const handle = await directoryHandle.getFileHandle(filename, { create: true });
    await writeDrawingToHandle(handle, text);
    return handle;
  } catch (error) {
    throw normalizeFsError(error, "Unable to save drawing in the selected folder");
  }
}

// ---- fallbacks ------------------------------------------------------------

// Opens the normal browser file chooser. `cancel` is supported in current
// browsers; otherwise an abandoned chooser simply never resolves (harmless).
export function pickDrawingViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${DRAWING_EXTENSION},.json,${DRAWING_MIME},application/json`;
    input.style.display = "none";
    const cleanup = () => input.remove();
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) { reject(new DrawingFileError("Cancelled", "cancelled")); return; }
      try { resolve({ name: file.name, text: await file.text() }); }
      catch (error) { reject(normalizeFsError(error, "Unable to open drawing")); }
    });
    input.addEventListener("cancel", () => { cleanup(); reject(new DrawingFileError("Cancelled", "cancelled")); });
    document.body.appendChild(input);
    input.click();
  });
}

export function chooseFallbackSaveName(suggestedName) {
  const suggested = ensureExtension(suggestedName);
  const entered = window.prompt("Save drawing as", suggested);
  if (entered === null) {
    throw new DrawingFileError("Cancelled", "cancelled");
  }
  const name = ensureExtension(entered.trim());
  if (!name || name === DRAWING_EXTENSION) {
    throw new DrawingFileError("A filename is required.", "invalid");
  }
  return name;
}

export function downloadDrawing(name, text) {
  const blob = new Blob([text], { type: DRAWING_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = ensureExtension(name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
