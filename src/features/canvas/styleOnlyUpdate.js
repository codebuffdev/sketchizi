// Style-only scene mutations (color, runs, opacity, ...) must never move an element
// or the camera. These helpers pin geometry and viewport around such updates.

export const GEOMETRY_PRESERVING_KEYS = new Set([
  "strokeColor", "backgroundColor", "opacity", "strokeStyle", "strokeWidth", "fillStyle", "roughness", "customData", "runs",
]);

/** True when every changed key is pure styling (fontSize/fontFamily legitimately re-measure text, so they are excluded). */
export const isGeometryPreservingPatch = (keys) => {
  const list = [...keys];
  return list.length > 0 && list.every((key) => GEOMETRY_PRESERVING_KEYS.has(key));
};

const GEOMETRY_FIELDS = ["x", "y", "width", "height", "angle"];

/** `after` with the world position, size and rotation of `before` (same object when nothing differs). */
export function restoreGeometry(before, after) {
  if (!before || !after || before === after) return after;
  const drifted = GEOMETRY_FIELDS.some((field) => before[field] !== after[field]);
  if (!drifted) return after;
  const next = { ...after };
  GEOMETRY_FIELDS.forEach((field) => { if (before[field] !== undefined) next[field] = before[field]; });
  return next;
}

export const readCamera = (appState = {}) => ({
  scrollX: Number(appState.scrollX) || 0,
  scrollY: Number(appState.scrollY) || 0,
  zoom: Number(appState.zoom?.value ?? appState.zoom) || 1,
});

export const cameraChanged = (a, b) =>
  Math.abs(a.scrollX - b.scrollX) > 0.01 || Math.abs(a.scrollY - b.scrollY) > 0.01 || Math.abs(a.zoom - b.zoom) > 1e-6;

/**
 * updateScene for a style change. Geometry is pinned for pure style patches, and the
 * camera (pan + zoom) is put back if the update or the render that follows moved it.
 * `neverCapture` is CaptureUpdateAction.NEVER (passed in so this module stays pure).
 */
export function commitStyleScene(api, { elements, patchKeys = [], captureUpdate, neverCapture, appState }) {
  const camera = readCamera(api.getAppState?.());
  const source = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
  const before = new Map(source.map((element) => [element.id, element]));
  const next = isGeometryPreservingPatch(patchKeys) ? elements.map((element) => restoreGeometry(before.get(element.id), element)) : elements;
  api.updateScene({ elements: next, ...(appState ? { appState } : {}), ...(captureUpdate !== undefined ? { captureUpdate } : {}) });

  const putCameraBack = () => {
    if (!cameraChanged(camera, readCamera(api.getAppState?.()))) return;
    api.updateScene({ appState: { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: { value: camera.zoom } }, ...(neverCapture !== undefined ? { captureUpdate: neverCapture } : {}) });
  };
  putCameraBack();
  // Re-check after the next paint (focus/selection restore can scroll), unless the user panned meanwhile.
  if (typeof window !== "undefined" && typeof requestAnimationFrame === "function") {
    let userMoved = false;
    const mark = () => { userMoved = true; };
    const events = ["wheel", "pointerdown"];
    events.forEach((name) => window.addEventListener(name, mark, { capture: true, passive: true }));
    requestAnimationFrame(() => {
      events.forEach((name) => window.removeEventListener(name, mark, { capture: true }));
      if (!userMoved) putCameraBack();
    });
  }
}
