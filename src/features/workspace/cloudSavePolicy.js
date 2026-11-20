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

/**
 * An existing cloud diagram may legitimately become empty on screen: Excalidraw
 * keeps tombstones (isDeleted) for removed elements, so a scene that contains
 * at least one element record is a real edit, even if nothing is visible.
 * A scene with no records at all is treated as a transient restore callback and
 * is never saved. Creating a *new* cloud diagram still refuses an empty canvas.
 */
export function allowsEmptyCloudSave(elements) {
  return hasCloudSceneChange(elements);
}

/**
 * onChange callbacks must be ignored only while the tab that is being
 * hydrated from the cloud is the active tab. The previous guard keyed off the
 * `cloudDiagramId` URL parameter, which never clears, so every other (local)
 * tab opened in the same page silently lost all of its onChange events.
 */
export function isCloudSceneRestoring({ restoringTabId, activeTabId, sceneReady }) {
  return Boolean(restoringTabId) && restoringTabId === activeTabId && !sceneReady;
}

/**
 * Decide where a finished cloud load belongs. The response must go to the tab
 * that started the load, not to whichever tab happens to be active when the
 * network request completes.
 *  - "apply": the originating tab is still active, restore into the live editor.
 *  - "store": the user moved to another tab; save the loaded document into the
 *             originating tab's snapshot only and leave the live canvas alone.
 *  - "drop":  the originating tab was closed; discard the result.
 */
export function resolveCloudLoadTarget({ targetTabId, activeTabId, tabIds }) {
  if (!targetTabId || !Array.isArray(tabIds) || !tabIds.includes(targetTabId)) return "drop";
  return targetTabId === activeTabId ? "apply" : "store";
}
