// Focal-point-preserving zoom.
//
// Excalidraw camera model: screen = (scene + scroll) * zoom, relative to the canvas
// origin (appState.offsetLeft/Top). With "pan" = scroll * zoom this is the familiar
// screen = scene * zoom + pan, so the requested maths is expressed below in scroll
// units: nextScroll = anchorScreen / nextZoom - focus.
//
// Focus priority: active selection / edit target > last clicked canvas point >
// viewport centre. The focal point is stored per Excalidraw API instance.
import { boundsOf } from "./pasteCentering.js";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.2;
export const SAFE_MARGIN = 64;
export const CAMERA_EVENT = "sketchizi:camera-change";

const focalStore = new WeakMap(); // api -> { x, y } (scene coordinates)

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const clampZoom = (zoom) => clamp(Number(zoom) || 1, MIN_ZOOM, MAX_ZOOM);
const zoomOf = (appState) => Number(appState?.zoom?.value ?? appState?.zoom) || 1;

function viewSize(appState, root) {
  const rect = root?.getBoundingClientRect?.();
  return {
    width: Number(appState?.width) || rect?.width || 800,
    height: Number(appState?.height) || rect?.height || 600,
  };
}

/** Pure: viewport centre in scene coordinates. */
export function getViewportCenter(appState, root) {
  const { width, height } = viewSize(appState, root);
  const zoom = zoomOf(appState);
  return {
    x: width / 2 / zoom - (Number(appState.scrollX) || 0),
    y: height / 2 / zoom - (Number(appState.scrollY) || 0),
  };
}

/** Centre of the selection (or text element being edited), or null. */
export function getActiveSelectionCenter(api) {
  const appState = api?.getAppState?.();
  if (!appState) return null;
  const ids = new Set(Object.keys(appState.selectedElementIds || {}).filter((id) => appState.selectedElementIds[id]));
  const editingId = appState.editingTextElement?.id;
  if (editingId) ids.add(editingId);
  if (!ids.size) return null;
  const elements = (api.getSceneElements?.() || []).filter((el) => el && !el.isDeleted && ids.has(el.id));
  const bounds = boundsOf(elements);
  return bounds ? { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 } : null;
}

export function setFocalPoint(api, point) {
  if (!api || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  focalStore.set(api, { x: point.x, y: point.y });
}
export const getLastClickedPoint = (api) => focalStore.get(api) ?? null;
export const clearFocalPoint = (api) => { if (api) focalStore.delete(api); };

/** Client (window) coordinates -> scene coordinates. */
export function clientToScene(api, root, clientX, clientY) {
  const appState = api.getAppState();
  const rect = root?.getBoundingClientRect?.();
  const left = Number.isFinite(appState.offsetLeft) ? appState.offsetLeft : rect?.left || 0;
  const top = Number.isFinite(appState.offsetTop) ? appState.offsetTop : rect?.top || 0;
  const zoom = zoomOf(appState);
  return {
    x: (clientX - left) / zoom - (Number(appState.scrollX) || 0),
    y: (clientY - top) / zoom - (Number(appState.scrollY) || 0),
  };
}

export function resolveFocus(api, root) {
  return getActiveSelectionCenter(api) ?? getLastClickedPoint(api) ?? getViewportCenter(api.getAppState(), root);
}

/** Pure: scroll that keeps `focus` under the (margin-clamped) anchor at nextZoom. */
export function computeFocalCamera({ focus, scrollX, scrollY, zoom, nextZoom, width, height, margin = SAFE_MARGIN }) {
  const next = clampZoom(nextZoom);
  const rawX = (focus.x + scrollX) * zoom;
  const rawY = (focus.y + scrollY) * zoom;
  const anchorX = width > margin * 2 ? clamp(rawX, margin, width - margin) : width / 2;
  const anchorY = height > margin * 2 ? clamp(rawY, margin, height - margin) : height / 2;
  return { zoom: next, scrollX: anchorX / next - focus.x, scrollY: anchorY / next - focus.y };
}

function applyCamera(api, camera) {
  api.updateScene?.({
    appState: { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: { value: camera.zoom } },
    captureUpdate: "NEVER",
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CAMERA_EVENT));
}

export function zoomToFocalPoint(api, nextZoom, root = null) {
  if (!api) return;
  const appState = api.getAppState();
  const { width, height } = viewSize(appState, root);
  const camera = computeFocalCamera({
    focus: resolveFocus(api, root),
    scrollX: Number(appState.scrollX) || 0,
    scrollY: Number(appState.scrollY) || 0,
    zoom: zoomOf(appState),
    nextZoom, width, height,
  });
  applyCamera(api, camera);
}

export const zoomStep = (api, direction, root = null) => {
  const current = zoomOf(api?.getAppState?.());
  zoomToFocalPoint(api, direction === "in" ? current * ZOOM_STEP : current / ZOOM_STEP, root);
};

/** Preset percentages (50, 75, 100, 125, 150, 200 ...). */
export const zoomToPercent = (api, percent, root = null) => zoomToFocalPoint(api, percent / 100, root);

/** Reset View: 100 %, keep the current viewport centre centred, refocus there. */
export function resetView(api, root = null) {
  if (!api) return;
  const appState = api.getAppState();
  const { width, height } = viewSize(appState, root);
  const center = getViewportCenter(appState, root);
  setFocalPoint(api, center);
  applyCamera(api, { zoom: 1, scrollX: width / 2 - center.x, scrollY: height / 2 - center.y });
}

const isTextEntryTarget = (target) => target instanceof Element
  && Boolean(target.closest("input, select, .monaco-editor, .cm-editor, textarea:not(.excalidraw-wysiwyg)"));

/** Wires pointer tracking, Ctrl/Cmd+wheel tracking and Ctrl/Cmd +/-/0 shortcuts. */
export function attachFocalZoom({ root, apiRef }) {
  if (!root) return () => {};
  const api = () => apiRef?.current;

  const onPointerDown = (event) => {
    const a = api();
    if (!a || event.button > 0 || !(event.target instanceof HTMLCanvasElement)) return; // canvas only, not UI chrome
    setFocalPoint(a, clientToScene(a, root, event.clientX, event.clientY));
  };
  // Excalidraw zooms Ctrl/Cmd+wheel and pinch (ctrlKey wheel) under the pointer itself; keep the focus in sync.
  const onWheel = (event) => {
    const a = api();
    if (!a || !(event.ctrlKey || event.metaKey)) return;
    setFocalPoint(a, clientToScene(a, root, event.clientX, event.clientY));
  };
  const onKeyDown = (event) => {
    const a = api();
    if (!a || !(event.ctrlKey || event.metaKey) || event.altKey || isTextEntryTarget(event.target)) return;
    const key = event.key;
    const code = event.code;
    const isIn = key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd";
    const isOut = key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract";
    const isReset = key === "0" || code === "Digit0" || code === "Numpad0";
    if (!isIn && !isOut && !isReset) return;
    event.preventDefault();
    event.stopPropagation();
    if (isReset) resetView(a, root);
    else zoomStep(a, isIn ? "in" : "out", root);
  };

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("wheel", onWheel, { capture: true, passive: true });
  window.addEventListener("keydown", onKeyDown, true);
  return () => {
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
