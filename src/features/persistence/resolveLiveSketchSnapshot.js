/**
 * Excalidraw can issue transient or superseded onChange snapshots during
 * restoration and tool updates. At debounce time, persist the live editor
 * state rather than an older callback's scene/appState pair.
 */
export function resolveLiveSketchSnapshot(api, fallbackElements, fallbackAppState) {
  const scene = api?.getSceneElementsIncludingDeleted?.()
    ?? api?.getSceneElements?.();
  return {
    elements: Array.isArray(scene) ? scene : fallbackElements,
    appState: api?.getAppState?.() ?? fallbackAppState,
  };
}
