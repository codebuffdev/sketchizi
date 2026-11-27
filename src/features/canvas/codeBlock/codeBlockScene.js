/**
 * Excalidraw glue for the Code Block tool.
 *
 * A committed code block is a real `image` element whose bitmap is painted by
 * renderCodeBlockImage() and whose source (code, filename, theme) lives in
 * customData.codeBlock. That makes it a first-class scene element: it pans,
 * zooms, selects, drags, duplicates, syncs, saves and exports like any image.
 */
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { putCachedFiles } from "../../workspace/binaryFileCache.js";
import { renderCodeBlockImage } from "./codeBlockRenderer.js";
import { CODE_BLOCK_DATA_KEY, codeBlockFileId, findCodeBlocks, isCodeBlockElement, normalizeCodeBlockData } from "./codeBlockModel.js";
import { effectiveFilename } from "./codeLanguages.js";

const nonce = () => Math.floor(Math.random() * 2147483647);

/** Build the bitmap file + natural size for a snippet and register it with the editor. */
export function prepareCodeBlockAsset(api, rawData) {
  const data = normalizeCodeBlockData({ ...rawData, filename: effectiveFilename(rawData?.filename) });
  const rendered = renderCodeBlockImage(data);
  const fileId = codeBlockFileId(data);
  const file = { id: fileId, dataURL: rendered.dataURL, mimeType: "image/png", created: Date.now(), lastRetrieved: Date.now() };
  api.addFiles?.([file]);
  putCachedFiles({ [fileId]: file }).catch(() => {});
  return { data, fileId, width: rendered.width, height: rendered.height };
}

/** Insert a new code block with its top-left corner at (x, y); returns the element. */
export function insertCodeBlock(api, { x, y, code = "", filename, theme }) {
  const asset = prepareCodeBlockAsset(api, { code, filename, theme });
  const [element] = convertToExcalidrawElements([{
    type: "image",
    x,
    y,
    width: asset.width,
    height: asset.height,
    fileId: asset.fileId,
    status: "saved",
    customData: { [CODE_BLOCK_DATA_KEY]: asset.data },
  }]);
  api.updateScene({
    elements: [...api.getSceneElements(), element],
    appState: { selectedElementIds: { [element.id]: true }, activeTool: { type: "selection", customType: null, locked: false, lastActiveTool: null } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element;
}

const mapElement = (api, id, fn) => api.getSceneElementsIncludingDeleted().map((element) => (element.id === id ? fn(element) : element));

/**
 * Replace a block's content. Natural size is recomputed from the new code
 * (so the card grows/shrinks with its text) while the top-left corner stays put.
 */
export function updateCodeBlock(api, id, rawData, { capture = CaptureUpdateAction.IMMEDIATELY, select = true } = {}) {
  const asset = prepareCodeBlockAsset(api, rawData);
  api.updateScene({
    elements: mapElement(api, id, (element) => ({
      ...element,
      width: asset.width,
      height: asset.height,
      fileId: asset.fileId,
      crop: null,
      status: "saved",
      opacity: 100,
      customData: { ...(element.customData || {}), [CODE_BLOCK_DATA_KEY]: asset.data },
      version: (Number(element.version) || 0) + 1,
      versionNonce: nonce(),
      updated: Date.now(),
    })),
    ...(select ? { appState: { selectedElementIds: { [id]: true } } } : {}),
    captureUpdate: capture,
  });
}

/** Hide / show a block while its DOM editor is open (never part of undo history). */
export function setCodeBlockOpacity(api, id, opacity) {
  api.updateScene({
    elements: mapElement(api, id, (element) => ({ ...element, opacity, version: (Number(element.version) || 0) + 1, versionNonce: nonce() })),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** Put a block back exactly as it was before editing started (not undoable). */
export function restoreCodeBlock(api, original) {
  api.updateScene({
    elements: mapElement(api, original.id, (element) => ({ ...element, opacity: original.opacity, version: (Number(element.version) || 0) + 1, versionNonce: nonce() })),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/**
 * Re-skin every block that was painted for the other theme. Keeps each
 * block's position and (possibly user-resized) dimensions; not undoable.
 * Returns how many blocks changed.
 */
export function rethemeCodeBlocks(api, theme) {
  const target = theme === "dark" ? "dark" : "light";
  const stale = findCodeBlocks(api.getSceneElements()).filter((element) => normalizeCodeBlockData(element.customData[CODE_BLOCK_DATA_KEY]).theme !== target);
  if (!stale.length) return 0;
  const replacements = new Map();
  for (const element of stale) {
    const data = normalizeCodeBlockData(element.customData[CODE_BLOCK_DATA_KEY]);
    const asset = prepareCodeBlockAsset(api, { ...data, theme: target });
    replacements.set(element.id, {
      ...element,
      fileId: asset.fileId,
      customData: { ...element.customData, [CODE_BLOCK_DATA_KEY]: asset.data },
      version: (Number(element.version) || 0) + 1,
      versionNonce: nonce(),
      updated: Date.now(),
    });
  }
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => replacements.get(element.id) || element),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return replacements.size;
}

export { isCodeBlockElement };
