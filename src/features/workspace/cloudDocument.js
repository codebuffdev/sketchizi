const EMPTY_CANVAS_MESSAGE = "This canvas is empty. Add at least one element before saving to Cloud Workspace.";

// Excalidraw appState contains runtime-only values (for example, collaborators
// is a Map). Persist only the stable, JSON-safe presentation settings.
export function sanitizeCloudAppState(appState = {}) {
  const safe = {};
  if (typeof appState.viewBackgroundColor === "string") safe.viewBackgroundColor = appState.viewBackgroundColor;
  if (Number.isFinite(appState.scrollX)) safe.scrollX = appState.scrollX;
  if (Number.isFinite(appState.scrollY)) safe.scrollY = appState.scrollY;
  const zoom = Number(appState.zoom?.value ?? appState.zoom);
  if (Number.isFinite(zoom) && zoom > 0) safe.zoom = { value: zoom };
  if (typeof appState.gridModeEnabled === "boolean") safe.gridModeEnabled = appState.gridModeEnabled;
  if (Number.isFinite(appState.currentItemFontFamily)) safe.currentItemFontFamily = appState.currentItemFontFamily;
  if (Number.isFinite(appState.gridSize)) safe.gridSize = appState.gridSize;
  if (Number.isFinite(appState.gridStep)) safe.gridStep = appState.gridStep;
  return safe;
}

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
    appState: sanitizeCloudAppState(appState || api.getAppState?.() || {}),
    files,
    metadata: metadata.metadata || {},
    extensions: metadata.extensions || {},
    format: metadata.format || "excalidraw",
  };
}
