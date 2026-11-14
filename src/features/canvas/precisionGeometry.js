import { PX_PER_CM } from "./elementMeasurement.js";

// Scene units are CSS pixels at 100% zoom. Measurements are not calibrated
// physical lengths on a user's display or printed page.
export function cmToScenePx(cm) {
  const value = Number(cm);
  return Number.isFinite(value) && value >= 0 ? value * PX_PER_CM : null;
}

export function scenePxToCm(px) {
  const value = Number(px);
  return Number.isFinite(value) ? value / PX_PER_CM : null;
}

export function snapToIncrement(value, increment) {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

export function constrainSquare(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx || 1) * side,
    y: start.y + Math.sign(dy || 1) * side,
  };
}

export function constrainLineAngle(start, end, stepDegrees = 15) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { ...end };
  if (!Number.isFinite(stepDegrees) || stepDegrees <= 0 || stepDegrees > 180) return { ...end };
  const step = stepDegrees * Math.PI / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
}

export function lineAngleDegrees(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return 0;
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

export function getShapePrecision(element) {
  if (!element) return null;
  const width = Math.abs(Number(element.width) || 0);
  const height = Math.abs(Number(element.height) || 0);
  if (element.type === "ellipse") {
    return { kind: "ellipse", radiusXcm: scenePxToCm(width / 2), radiusYcm: scenePxToCm(height / 2) };
  }
  if (element.type === "rectangle" || element.type === "diamond") {
    return { kind: "dimensions", widthCm: scenePxToCm(width), heightCm: scenePxToCm(height) };
  }
  if (element.type === "line" || element.type === "arrow") {
    const points = element.points;
    if (!Array.isArray(points) || points.length < 2) return null;
    const first = points[0], last = points[points.length - 1];
    const lengthPx = points.slice(1).reduce((sum, point, i) =>
      sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0);
    return {
      kind: "linear",
      lengthCm: scenePxToCm(lengthPx),
      angleDegrees: lineAngleDegrees({ x: first[0], y: first[1] }, { x: last[0], y: last[1] }),
    };
  }
  return null;
}
