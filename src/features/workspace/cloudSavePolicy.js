/**
 * A cloud save must not be created from a transient empty onChange callback
 * during scene restoration. Excalidraw retains deleted element tombstones;
 * those are meaningful edits even when no visible elements remain.
 */
export function hasCloudSceneChange(elements) {
  return Array.isArray(elements) && elements.some((element) => element && typeof element.id === "string");
}

/** Once a cloud document is detached, the new canvas belongs to local autosave. */
export function usesLocalAutosave(cloudDiagramId, detached) {
  return !cloudDiagramId || Boolean(detached);
}

/** A save started in an older document must not update the current document's state. */
export function isActiveCloudSession(expected, current) {
  return Boolean(expected?.active && current === expected);
}
