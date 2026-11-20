import {
  DEFAULT_STROKE_STREAMLINE,
  DEFAULT_STROKE_STREAMLINE_PRECISE,
  getStrokeWidthByKey,
} from "@excalidraw/common";
import { getFreedrawOutlinePoints, newFreeDrawElement } from "@excalidraw/element";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getAdjustedFreeDrawStreamline = (pointerType) => (pointerType !== "mouse"
  ? DEFAULT_STROKE_STREAMLINE_PRECISE
  : DEFAULT_STROKE_STREAMLINE) * 0.95;

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
  const previewElement = {
    type: "freedraw",
    strokeWidth: strokeWidth * Math.max(0.0001, appState?.zoom?.value || 1),
    simulatePressure: session.simulatePressure,
    points: session.previewPoints.map(({ x, y }) => [x, y]),
    pressures: session.simulatePressure
      ? []
      : session.previewPoints.map(({ pressure }) => pressure),
    strokeOptions: { variability, streamline },
  };
  const outline = getFreedrawOutlinePoints(previewElement);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!outline?.length) return;

  context.save();
  context.globalAlpha = clamp((appState?.currentItemOpacity ?? 100) / 100, 0, 1);
  context.fillStyle = appState?.currentItemStrokeColor || "#1e1e1e";
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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of scenePoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const firstSample = samples[0];
  const simulatePressure = firstSample.pressure === 0.5;
  const pointerType = firstSample.pointerType || "mouse";

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
    points: scenePoints.map((point) => [point.x - minX, point.y - minY]),
    pressures: simulatePressure ? [] : scenePoints.map((point) => point.pressure),
  });
}
