import {
  DEFAULT_STROKE_STREAMLINE,
  DEFAULT_STROKE_STREAMLINE_PRECISE,
  getStrokeWidthByKey,
} from "@excalidraw/common";
import { newFreeDrawElement } from "@excalidraw/element";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const midpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  pressure: (a.pressure + b.pressure) / 2,
});

const previewStrokeWidth = (appState, pressure) => {
  const strokeWidth = getStrokeWidthByKey(
    "freedraw",
    appState?.currentItemStrokeWidthKey || "medium",
  );
  const zoom = Math.max(0.0001, appState?.zoom?.value || 1);
  const variability = appState?.currentItemStrokeVariability || "variable";
  const sizeFactor = variability === "constant" ? 1.4 : 4.25;
  const pressureFactor = variability === "constant"
    ? 1
    : clamp(0.4 + 1.2 * pressure, 0.1, 1.6);
  return Math.max(0.5, strokeWidth * sizeFactor * zoom * pressureFactor);
};

function drawPreviewSegment(context, start, control1, control2, end, appState) {
  const pressure = (control1.pressure + control2.pressure + end.pressure) / 3;
  context.save();
  context.globalAlpha = clamp((appState?.currentItemOpacity ?? 100) / 100, 0, 1);
  context.strokeStyle = appState?.currentItemStrokeColor || "#1e1e1e";
  context.lineWidth = previewStrokeWidth(appState, pressure);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.bezierCurveTo(
    control1.x,
    control1.y,
    control2.x,
    control2.y,
    end.x,
    end.y,
  );
  context.stroke();
  context.restore();
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
  if (session.previewPoints.length === 1) {
    const radius = previewStrokeWidth(appState, point.pressure) / 2;
    context.save();
    context.globalAlpha = clamp((appState?.currentItemOpacity ?? 100) / 100, 0, 1);
    context.fillStyle = appState?.currentItemStrokeColor || "#1e1e1e";
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    session.previewEnd = point;
    return;
  }

  const before = session.previewPoints[session.previewPoints.length - 3] || previous;
  const control1 = session.previewPoints.length > 2
    ? {
        x: previous.x + (previous.x - before.x) / 6,
        y: previous.y + (previous.y - before.y) / 6,
        pressure: previous.pressure,
      }
    : previous;
  const control2 = {
    x: point.x - (point.x - previous.x) / 6,
    y: point.y - (point.y - previous.y) / 6,
    pressure: point.pressure,
  };
  // Each incremental cubic ends at the newest hardware sample, so curve
  // interpolation never leaves the visible tip behind the pointer.
  drawPreviewSegment(context, previous, control1, control2, point, appState);
  session.previewEnd = point;
}

export function finishFreeDrawPreview(context, session, appState) {
  const last = session.previewPoints[session.previewPoints.length - 1];
  if (!last || !session.previewEnd) return;
  // Preview segments already terminate at the newest pointer sample. There
  // is no delayed midpoint tail to catch up on pointer-up.
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
    strokeWidth: getStrokeWidthByKey(
      "freedraw",
      appState.currentItemStrokeWidthKey || "medium",
    ),
    strokeStyle: appState.currentItemStrokeStyle,
    roughness: appState.currentItemRoughness,
    opacity: appState.currentItemOpacity,
    roundness: null,
    simulatePressure,
    strokeOptions: {
      variability: appState.currentItemStrokeVariability || "variable",
      streamline: pointerType !== "mouse"
        ? DEFAULT_STROKE_STREAMLINE_PRECISE
        : DEFAULT_STROKE_STREAMLINE,
    },
    locked: false,
    frameId: appState.frameToHighlight?.id || null,
    points: scenePoints.map((point) => [point.x - minX, point.y - minY]),
    pressures: simulatePressure ? [] : scenePoints.map((point) => point.pressure),
  });
}
