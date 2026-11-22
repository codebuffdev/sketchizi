// Pure geometry for free-angle multi-point arrows / lines.
//
// Everything here works on plain data (no Excalidraw imports, no DOM) so it can
// be unit-tested with `node --test`. Points are SCENE coordinates unless a
// function says "relative" (Excalidraw stores `element.points` relative to
// `element.x / element.y`).

export const PORT_SNAP_PX = 14;
export const ANGLE_SNAP_DEGREES = 3.5;
export const ANGLE_SNAP_STEP_DEGREES = 15; // covers 15° / 30° / 45° / 60° / 75° / 90° ...
export const MIDPOINT_MIN_SEGMENT_PX = 28;
export const PORT_SHAPE_TYPES = new Set(["rectangle", "diamond", "ellipse"]);
export const ROUTING_MODES = ["polyline", "curve", "elbow"];

const DEG = 180 / Math.PI;

/** Dot arrowhead radius in scene px. Excalidraw's "circle" head is drawn from the stroke width. */
export function dotArrowheadRadius(strokeWidth) {
  return Math.max(4, (Number(strokeWidth) || 1) * 2);
}

/* ---------- point conversion ---------- */

export function getAbsolutePoints(element) {
  const x = Number(element?.x) || 0;
  const y = Number(element?.y) || 0;
  const source = Array.isArray(element?.points) && element.points.length >= 2
    ? element.points
    : [[0, 0], [Number(element?.width) || 0, Number(element?.height) || 0]];
  return source.map(([px, py]) => ({ x: x + px, y: y + py }));
}

/** Patch (x, y, width, height, points) that stores the given absolute points on an element. */
export function absolutePointsToPatch(absolutePoints) {
  const origin = absolutePoints[0];
  const points = absolutePoints.map((p) => [p.x - origin.x, p.y - origin.y]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x: origin.x,
    y: origin.y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points,
    lastCommittedPoint: null,
  };
}

/* ---------- angle snapping ---------- */

/** Angle of the vector from -> to in degrees, normalised to [0, 360). */
export function segmentAngleDegrees(from, to) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * DEG;
  return (angle + 360) % 360;
}

/**
 * Soft angle snap. The free point is pulled onto the nearest 15° ray only when it
 * is already within `tolerance` degrees of it, so any other angle stays free.
 * Returns { point, angle, snapped }. `angle` is the (possibly snapped) angle.
 */
export function softSnapAngle(from, to, {
  tolerance = ANGLE_SNAP_DEGREES,
  step = ANGLE_SNAP_STEP_DEGREES,
  disabled = false,
} = {}) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = segmentAngleDegrees(from, to);
  if (disabled || length < 1e-6) return { point: { x: to.x, y: to.y }, angle, snapped: false };
  const nearest = Math.round(angle / step) * step;
  if (Math.abs(nearest - angle) > tolerance) return { point: { x: to.x, y: to.y }, angle, snapped: false };
  const radians = nearest / DEG;
  const exact = (value) => Math.abs(value) < 1e-9 ? 0 : value;
  return {
    point: { x: from.x + exact(Math.cos(radians)) * length, y: from.y + exact(Math.sin(radians)) * length },
    angle: nearest % 360,
    snapped: true,
  };
}

/* ---------- 4-port shape snapping ---------- */

/** Perimeter ports (top / right / bottom / left centres) of a rectangle, diamond or ellipse. */
export function getShapePorts(shape) {
  if (!shape || !PORT_SHAPE_TYPES.has(shape.type) || shape.isDeleted) return [];
  const width = Number(shape.width) || 0;
  const height = Number(shape.height) || 0;
  if (Math.abs(width) < 1 || Math.abs(height) < 1) return [];
  const cx = shape.x + width / 2;
  const cy = shape.y + height / 2;
  const angle = Number(shape.angle) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotate = (dx, dy) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
  return [
    { side: "top", shapeId: shape.id, ...rotate(0, -height / 2) },
    { side: "right", shapeId: shape.id, ...rotate(width / 2, 0) },
    { side: "bottom", shapeId: shape.id, ...rotate(0, height / 2) },
    { side: "left", shapeId: shape.id, ...rotate(-width / 2, 0) },
  ];
}

/**
 * Nearest shape port within `thresholdPx` SCREEN pixels of `point` (so the snap
 * zone stays 14px at every zoom level). Returns the port or null.
 */
export function findPortSnap(point, shapes, { thresholdPx = PORT_SNAP_PX, zoom = 1, excludeIds = [] } = {}) {
  const limit = thresholdPx / Math.max(zoom, 0.01);
  const excluded = new Set(excludeIds);
  let best = null;
  for (const shape of shapes || []) {
    if (!shape || excluded.has(shape.id)) continue;
    for (const port of getShapePorts(shape)) {
      const distance = Math.hypot(port.x - point.x, port.y - point.y);
      if (distance <= limit && (!best || distance < best.distance)) best = { ...port, distance };
    }
  }
  return best;
}

/* ---------- vertices & midpoints ---------- */

/** Ghost "+" handles: the centre of every segment longer than `minLengthPx` screen px. */
export function getSegmentMidpoints(points, { zoom = 1, minLengthPx = MIDPOINT_MIN_SEGMENT_PX } = {}) {
  const result = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) * zoom <= minLengthPx) continue;
    result.push({ segmentIndex: i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return result;
}

/** Inserts `point` after `segmentIndex`; the new vertex has index segmentIndex + 1. */
export function insertVertex(points, segmentIndex, point) {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return points;
  return [...points.slice(0, segmentIndex + 1), { x: point.x, y: point.y }, ...points.slice(segmentIndex + 1)];
}

/** Deletes an intermediate bend; endpoints and 2-point lines are never removed. */
export function removeVertex(points, index) {
  if (points.length <= 2 || index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}

export function moveVertex(points, index, point) {
  if (index < 0 || index >= points.length) return points;
  return points.map((p, i) => (i === index ? { x: point.x, y: point.y } : p));
}

/* ---------- routing modes ---------- */

export function getRoutingMode(element) {
  if (!element) return "polyline";
  if (element.type === "arrow" && element.elbowed) return "elbow";
  if (element.roundness) return "curve";
  return "polyline";
}

const isOrthogonal = (a, b) => Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
const samePoint = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** True when every segment is horizontal or vertical (dx === 0 || dy === 0). */
export function isOrthogonalPath(points) {
  for (let i = 0; i < points.length - 1; i += 1) if (!isOrthogonal(points[i], points[i + 1])) return false;
  return true;
}

/**
 * Turns waypoints into a clean orthogonal path. The path passes through every
 * waypoint's x / y; wherever two neighbours differ on both axes one corner is
 * inserted, alternating direction so the path zig-zags instead of doubling back.
 * Duplicate and collinear points are then merged (endpoints are never moved).
 */
export function normalizeOrthogonalPath(points) {
  if (points.length < 2) return points;
  const path = [{ ...points[0] }];
  let horizontalFirst = Math.abs(points[1].x - points[0].x) >= Math.abs(points[1].y - points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = path[path.length - 1];
    const next = points[i];
    if (!isOrthogonal(prev, next)) {
      path.push(horizontalFirst ? { x: next.x, y: prev.y } : { x: prev.x, y: next.y });
      horizontalFirst = !horizontalFirst;
    }
    path.push({ ...next });
  }
  const deduped = path.filter((p, i) => i === 0 || !samePoint(p, path[i - 1]));
  // Drop collinear middle points (a -> b -> c on one axis) but never the endpoints.
  return deduped.filter((p, i) => {
    if (i === 0 || i === deduped.length - 1) return true;
    const a = deduped[i - 1];
    const c = deduped[i + 1];
    return !((a.x === p.x && p.x === c.x) || (a.y === p.y && p.y === c.y));
  });
}

/**
 * Element patch that switches an arrow / line to a routing mode, honouring the
 * waypoints the user placed:
 *   polyline -> straight segments through all points (elbowed: false)
 *   curve    -> quadratic spline through all points (roundness type 2)
 *   elbow    -> normalised orthogonal path, arrows only (elbowed: true)
 */
export function getRoutingPatch(element, mode) {
  const absolute = getAbsolutePoints(element);
  if (mode === "elbow" && element.type === "arrow") {
    return {
      ...absolutePointsToPatch(normalizeOrthogonalPath(absolute)),
      elbowed: true,
      roundness: null,
    };
  }
  if (mode === "curve") {
    // A straight 2-point arrow cannot curve; add one perpendicular waypoint so the
    // mode change is visible and gives the user a bend to pull on.
    let pts = absolute;
    if (pts.length === 2) {
      const [a, b] = pts;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const bend = Math.max(24, Math.min(72, length * 0.18));
      pts = [a, { x: (a.x + b.x) / 2 - (dy / length) * bend, y: (a.y + b.y) / 2 + (dx / length) * bend }, b];
    }
    return { ...absolutePointsToPatch(pts), ...(element.type === "arrow" ? { elbowed: false } : {}), roundness: { type: 2 } };
  }
  return { ...absolutePointsToPatch(absolute), ...(element.type === "arrow" ? { elbowed: false } : {}), roundness: null };
}

/* ---------- bindings ---------- */

/**
 * Re-points an arrow end at a shape port (or clears it). `which` is "start" | "end".
 * Returns { arrowPatch, shapeUpdates } where shapeUpdates maps shapeId -> boundElements.
 */
export function getPortBindingChanges(arrow, which, port, scene) {
  const key = which === "start" ? "startBinding" : "endBinding";
  const previous = arrow[key]?.elementId || null;
  const nextId = port?.shapeId || null;
  if (previous === nextId) return { arrowPatch: port ? { [key]: { ...arrow[key], focus: 0, gap: 0 } } : {}, shapeUpdates: new Map() };
  const shapeUpdates = new Map();
  const byId = new Map((scene || []).map((el) => [el.id, el]));
  if (previous && byId.get(previous)) {
    shapeUpdates.set(previous, (byId.get(previous).boundElements || []).filter((b) => b.id !== arrow.id));
  }
  if (nextId && byId.get(nextId)) {
    const existing = shapeUpdates.get(nextId) || byId.get(nextId).boundElements || [];
    shapeUpdates.set(nextId, existing.some((b) => b.id === arrow.id) ? existing : [...existing, { id: arrow.id, type: "arrow" }]);
  }
  return {
    arrowPatch: { [key]: port ? { elementId: nextId, focus: 0, gap: 0 } : null },
    shapeUpdates,
  };
}
