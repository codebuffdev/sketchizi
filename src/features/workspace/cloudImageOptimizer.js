import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { putCachedFiles } from "./binaryFileCache.js";
import { optimizeImageToLimit } from "../canvas/imageImport/imageCompression.js";
import { contentFileId, dataUrlToFile, readAsDataURL } from "../canvas/imageImport/imageFileUtils.js";

/**
 * Shrinks the planned embedded images in place. Each optimized image is stored under a new content id and
 * every image element that referenced the old id is re-pointed at it; element size, position and
 * rotation are untouched, so layout, aspect ratio and alpha are preserved. The scene update is kept out
 * of undo history so Ctrl+Z can never bring an oversized asset back into a cloud-backed canvas.
 * Returns the list of { oldId, newId, before, after }.
 */
export async function optimizeEmbeddedImages({ api, targets, signal, onProgress }) {
  const files = api.getFiles?.() || {};
  const replaced = [];
  for (const [index, target] of targets.entries()) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    onProgress?.(index, targets.length);
    const original = files[target.id];
    if (!original?.dataURL) continue;
    const source = dataUrlToFile(original.dataURL, target.id);
    const result = await optimizeImageToLimit(source, target.targetBlobBytes, { signal });
    const [dataURL, newId] = await Promise.all([readAsDataURL(result.file), contentFileId(result.file)]);
    const fileData = { ...original, id: newId, dataURL, mimeType: result.mimeType, created: Date.now(), lastRetrieved: Date.now() };
    replaced.push({ oldId: target.id, newId, fileData, before: result.originalSize, after: result.newSize });
  }
  if (!replaced.length) return [];
  api.addFiles(replaced.map((item) => item.fileData));
  putCachedFiles(Object.fromEntries(replaced.map((item) => [item.newId, item.fileData]))).catch(() => {});
  const idMap = new Map(replaced.map((item) => [item.oldId, item.newId]));
  const now = Date.now();
  const elements = (api.getSceneElementsIncludingDeleted?.() || api.getSceneElements()).map((element) =>
    element.type === "image" && idMap.has(element.fileId)
      ? { ...element, fileId: idMap.get(element.fileId), status: "saved", version: (Number(element.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now }
      : element);
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
  return replaced.map(({ oldId, newId, before, after }) => ({ oldId, newId, before, after }));
}
