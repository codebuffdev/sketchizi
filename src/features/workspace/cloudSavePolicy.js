/**
 * Once hydration is complete, every array emitted by onChange is a scene
 * snapshot worth persisting. An empty array is a real edit when the user has
 * deleted the final element; restoration callbacks are filtered by the
 * tab-scoped hydration guard in App before reaching the save pipeline.
 */
export function hasCloudSceneChange(elements) {
  return Array.isArray(elements);
}

/** Once a cloud document is detached, the new canvas belongs to local autosave. */
export function usesLocalAutosave(cloudDiagramId, detached) {
  return !cloudDiagramId || Boolean(detached);
}

/** A save started in an older document must not update the current document's state. */
export function isActiveCloudSession(expected, current) {
  return Boolean(expected?.active && current === expected);
}
