const EMPTY_CANVAS_MESSAGE = "This canvas is empty. Add at least one element before saving to Cloud Workspace.";

export function createCloudDocument({
  api,
  elements,
  appState,
  metadata = {},
  allowEmpty = false,
}) {
  if (!api) throw new Error("The editor is not ready to save this drawing.");

  const sourceElements = Array.isArray(elements)
    ? elements
    : (api.getSceneElements?.() || []);
  const liveElements = sourceElements.filter((element) => element && !element.isDeleted);

  if (!allowEmpty && liveElements.length === 0) {
    throw new Error(EMPTY_CANVAS_MESSAGE);
  }

  const availableFiles = api.getFiles?.() || {};
  const referencedFileIds = new Set(
    liveElements
      .map((element) => element.fileId)
      .filter((fileId) => typeof fileId === "string" && fileId.length > 0),
  );
  const files = {};
  for (const fileId of referencedFileIds) {
    if (Object.prototype.hasOwnProperty.call(availableFiles, fileId)) {
      files[fileId] = availableFiles[fileId];
    }
  }

  return {
    elements: liveElements,
    appState: appState || api.getAppState?.() || {},
    files,
    metadata: metadata.metadata || {},
    extensions: metadata.extensions || {},
    format: metadata.format || "excalidraw",
  };
}
