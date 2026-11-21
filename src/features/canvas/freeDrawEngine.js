import {
  applyDarkModeFilter,
  getStrokeWidthByKey,
} from "@excalidraw/common";
import { getFreedrawOutlinePoints, newFreeDrawElement } from "@excalidraw/element";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Shared smoothing profile. The live preview (pointermove) and the committed
// element (pointerup) both read these values, so releasing the mouse never
// changes the shape of the stroke.
//  - streamline: Excalidraw/perfect-freehand centerline lag. Higher = smoother.
//  - smoothing: input-point relaxation applied before the outline is built.
//    Excalidraw hardcodes perfect-freehand's own `smoothing` (0.5) and only
//    exposes `streamline` on elements, so this extra pass is what lifts the
//    effective smoothing into the 0.7-0.85 range for rough mouse input.
// Stylus/touch keep a lighter profile because their input is already clean.
export const FREE_DRAW_SMOOTHING_PROFILE = Object.freeze({
  mouse: Object.freeze({ streamline: 0.72, smoothing: 0.78 }),
  precise: Object.freeze({ streamline: 0.45, smoothing: 0.4 }),
});

export const getFreeDrawSmoothingProfile = (pointerType) =>
  pointerType === "mouse" || !pointerType
    ? FREE_DRAW_SMOOTHING_PROFILE.mouse
    : FREE_DRAW_SMOOTHING_PROFILE.precise;

const getAdjustedFreeDrawStreamline = (pointerType) => getFreeDrawSmoothingProfile(pointerType).streamline;

// Relax every interior point toward the midpoint of its neighbours. Endpoints
// stay fixed so the stroke still starts and ends exactly under the cursor
// (no input lag at the tip). The operation is affine-invariant, so running it
// on screen-space preview points and scene-space committed points yields the
// same shape.
export function smoothFreeDrawPoints(points, smoothing = 0.78, passes = 2) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const strength = clamp(smoothing, 0, 1) * 0.5;
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((point) => ({ ...point }));
    for (let i = 1; i < current.length - 1; i += 1) {
      const prev = current[i - 1];
      const point = current[i];
      const following = current[i + 1];
      next[i].x = point.x + ((prev.x + following.x) / 2 - point.x) * strength * 2;
      next[i].y = point.y + ((prev.y + following.y) / 2 - point.y) * strength * 2;
    }
    current = next;
  }
  return current;
}

// Excalidraw stores strokeColor untouched (e.g. #1e1e1e) and draws elements
// through a dark-mode colour filter. The preview overlay is a separate canvas,
// so it must apply that same mapping or default dark strokes are invisible
// while dragging.
export function resolveFreeDrawPreviewColor(color, theme) {
  const base = color || "#1e1e1e";
  if (theme !== "dark" || base === "transparent") return base;
  try {
    return applyDarkModeFilter(base);
  } catch {
    return base;
  }
}

const getAdjustedFreeDrawStrokeWidth = (strokeWidthKey) => {
  const width = getStrokeWidthByKey("freedraw", strokeWidthKey || "medium");
  return strokeWidthKey === "medium" || !strokeWidthKey ? width * 0.8 * 0.9 * 0.85 : width;
};

export function getPointerEventSamples(event) {
  let coalesced = [];
  try {
    coalesced = event.getCoalescedEvents?.() || [];
  } catch {
    coalesced = [];
  }

  const events = coalesced.length ? [...coalesced] : [event];
  const last = events[events.length - 1];
  if (
    last !== event &&
    (!last ||
      last.clientX !== event.clientX ||
      last.clientY !== event.clientY ||
      last.pressure !== event.pressure ||
      last.timeStamp !== event.timeStamp)
  ) {
    events.push(event);
  }

  return events
    .filter((sample) => Number.isFinite(sample.clientX) && Number.isFinite(sample.clientY))
    .map((sample) => ({
      clientX: sample.clientX,
      clientY: sample.clientY,
      pressure: Number.isFinite(sample.pressure) ? sample.pressure : 0.5,
      timeStamp: Number.isFinite(sample.timeStamp) ? sample.timeStamp : 0,
      pointerType: sample.pointerType || event.pointerType || "mouse",
    }));
}

export function scenePointFromPointerSample(sample, appState) {
  const zoom = Math.max(0.0001, appState?.zoom?.value || 1);
  return {
    x: (sample.clientX - (appState?.offsetLeft || 0)) / zoom - (appState?.scrollX || 0),
    y: (sample.clientY - (appState?.offsetTop || 0)) / zoom - (appState?.scrollY || 0),
    pressure: sample.pressure,
  };
}

export function drawFreeDrawPreviewSample(context, session, sample, appState, wrapperRect) {
  const point = {
    x: sample.clientX - wrapperRect.left,
    y: sample.clientY - wrapperRect.top,
    pressure: sample.pressure,
  };
  const previous = session.previewPoints[session.previewPoints.length - 1];
  if (
    previous &&
    previous.x === point.x &&
    previous.y === point.y &&
    previous.pressure === point.pressure
  ) {
    return;
  }

  session.previewPoints.push(point);

  // Use Excalidraw's own freedraw outline generator for the live preview.
  // A canvas lineWidth approximation cannot match perfect-freehand's
  // pressure, streamline, easing, and end-cap geometry.
  const variability = appState?.currentItemStrokeVariability || "variable";
  const streamline = getAdjustedFreeDrawStreamline(session.pointerType);
  const strokeWidth = getAdjustedFreeDrawStrokeWidth(appState?.currentItemStrokeWidthKey);
  const { smoothing } = getFreeDrawSmoothingProfile(session.pointerType);
  const smoothedPoints = smoothFreeDrawPoints(session.previewPoints, smoothing);
  const previewElement = {
    type: "freedraw",
    strokeWidth: strokeWidth * Math.max(0.0001, appState?.zoom?.value || 1),
    simulatePressure: session.simulatePressure,
    points: smoothedPoints.map(({ x, y }) => [x, y]),
    pressures: session.simulatePressure
      ? []
      : smoothedPoints.map(({ pressure }) => pressure),
    strokeOptions: { variability, streamline },
  };
  const outline = getFreedrawOutlinePoints(previewElement);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!outline?.length) return;

  context.save();
  context.globalAlpha = clamp((appState?.currentItemOpacity ?? 100) / 100, 0, 1);
  context.fillStyle = resolveFreeDrawPreviewColor(appState?.currentItemStrokeColor, appState?.theme);
  context.beginPath();
  context.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) {
    context.lineTo(outline[i][0], outline[i][1]);
  }
  context.closePath();
  context.fill();
  context.restore();
}

export function createFreeDrawElementFromSamples(samples, appState) {
  if (!samples?.length || !appState) return null;

  const scenePoints = [];
  for (const sample of samples) {
    const point = scenePointFromPointerSample(sample, appState);
    const previous = scenePoints[scenePoints.length - 1];
    if (
      previous &&
      previous.x === point.x &&
      previous.y === point.y &&
      previous.pressure === point.pressure
    ) {
      continue;
    }
    scenePoints.push(point);
  }

  if (!scenePoints.length) return null;
  if (scenePoints.length === 1) {
    scenePoints.push({
      x: scenePoints[0].x + 0.0001,
      y: scenePoints[0].y + 0.0001,
      pressure: scenePoints[0].pressure,
    });
  } else if (scenePoints.every((point) =>
    point.x === scenePoints[0].x && point.y === scenePoints[0].y
  )) {
    // Match Excalidraw's tiny non-zero endpoint for a stationary tap.
    const last = scenePoints[scenePoints.length - 1];
    last.x += 0.0001;
    last.y += 0.0001;
  }

  const firstSample = samples[0];
  const simulatePressure = firstSample.pressure === 0.5;
  const pointerType = firstSample.pointerType || "mouse";
  // Same smoothing as the live preview, so pointerup does not visibly snap.
  const smoothScenePoints = smoothFreeDrawPoints(scenePoints, getFreeDrawSmoothingProfile(pointerType).smoothing);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of smoothScenePoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return newFreeDrawElement({
    type: "freedraw",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    strokeColor: appState.currentItemStrokeColor,
    backgroundColor: appState.currentItemBackgroundColor,
    fillStyle: appState.currentItemFillStyle,
    strokeWidth: getAdjustedFreeDrawStrokeWidth(appState.currentItemStrokeWidthKey),
    strokeStyle: appState.currentItemStrokeStyle,
    roughness: appState.currentItemRoughness,
    opacity: appState.currentItemOpacity,
    roundness: null,
    simulatePressure,
    strokeOptions: {
      variability: appState.currentItemStrokeVariability || "variable",
      streamline: getAdjustedFreeDrawStreamline(pointerType),
    },
    locked: false,
    frameId: appState.frameToHighlight?.id || null,
    points: smoothScenePoints.map((point) => [point.x - minX, point.y - minY]),
    pressures: simulatePressure ? [] : smoothScenePoints.map((point) => point.pressure),
  });
}
