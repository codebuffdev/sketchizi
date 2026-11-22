const ALIGNMENT_TOLERANCE = 7;

function isVisible(element) {
  return element && !element.isDeleted && !element.deleted &&
    Number.isFinite(Number(element.x)) && Number.isFinite(Number(element.y));
}

export function getElementBounds(element) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  return { left: x, right: x + width, centerX: x + width / 2, top: y, bottom: y + height, centerY: y + height / 2, width, height };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) >= Math.max(aStart, bStart);
}

/** Detect edge and center alignments in scene coordinates. */
export function calculateAlignmentGuides(elements, selectedIds, tolerance = ALIGNMENT_TOLERANCE) {
  if (!Array.isArray(elements) || !(selectedIds instanceof Set) || !selectedIds.size) return [];
  const moving = elements.filter((element) => isVisible(element) && selectedIds.has(element.id));
  const stationary = elements.filter((element) => isVisible(element) && !selectedIds.has(element.id));
  if (!moving.length || !stationary.length) return [];

  const movingBounds = moving.map(getElementBounds);
  const guides = [];
  const seen = new Set();
  for (const element of stationary) {
    const target = getElementBounds(element);
    for (const movingBox of movingBounds) {
      const candidates = [
        ["x", movingBox.left, target.left], ["x", movingBox.left, target.centerX],
        ["x", movingBox.left, target.right], ["x", movingBox.centerX, target.left],
        ["x", movingBox.centerX, target.centerX], ["x", movingBox.centerX, target.right],
        ["x", movingBox.right, target.left], ["x", movingBox.right, target.centerX],
        ["x", movingBox.right, target.right],
        ["y", movingBox.top, target.top], ["y", movingBox.top, target.centerY],
        ["y", movingBox.top, target.bottom], ["y", movingBox.centerY, target.top],
        ["y", movingBox.centerY, target.centerY], ["y", movingBox.centerY, target.bottom],
        ["y", movingBox.bottom, target.top], ["y", movingBox.bottom, target.centerY],
        ["y", movingBox.bottom, target.bottom],
      ];
      for (const [axis, from, to] of candidates) {
        const distance = Math.abs(from - to);
        if (distance > tolerance) continue;
        // Smart guides should align objects even when they do not overlap on the perpendicular axis.
        const key = axis + ":" + Math.round(to * 100) / 100;
        if (seen.has(key)) continue;
        seen.add(key);
        const all = movingBounds.concat(target);
        guides.push({
          axis, position: to, kind: "alignment", distance,
          start: axis === "x" ? Math.min(...all.map((b) => b.top)) - 12 : Math.min(...all.map((b) => b.left)) - 12,
          end: axis === "x" ? Math.max(...all.map((b) => b.bottom)) + 12 : Math.max(...all.map((b) => b.right)) + 12,
        });
      }
    }
  }
  // Keep the overlay calm: show only the closest useful alignment per axis.
  return ["x", "y"].map((axis) => guides
    .filter((guide) => guide.axis === axis)
    .sort((a, b) => a.distance - b.distance)[0])
    .filter(Boolean);
}

/**
 * Find equal-gap opportunities for one moving object. The returned delta is
 * the scene-space correction needed to make the adjacent gaps equal.
 */
export function calculateEqualSpacingGuides(elements, selectedIds, tolerance = ALIGNMENT_TOLERANCE) {
  if (!Array.isArray(elements) || !(selectedIds instanceof Set) || selectedIds.size !== 1) return [];
  const movingElement = elements.find((element) => isVisible(element) && selectedIds.has(element.id));
  if (!movingElement) return [];
  const moving = getElementBounds(movingElement);
  const stationary = elements.filter((element) => isVisible(element) && !selectedIds.has(element.id))
    .map((element) => ({ element, bounds: getElementBounds(element) }));
  const guides = [];

  for (const axis of ["x", "y"]) {
    const start = axis === "x" ? moving.left : moving.top;
    const end = axis === "x" ? moving.right : moving.bottom;
    const crossStart = axis === "x" ? moving.top : moving.left;
    const crossEnd = axis === "x" ? moving.bottom : moving.right;
    const candidates = stationary.filter(({ bounds }) => overlaps(
      crossStart, crossEnd,
      axis === "x" ? bounds.top : bounds.left,
      axis === "x" ? bounds.bottom : bounds.right,
    ));
    for (const before of candidates) for (const after of candidates) {
      if (before === after) continue;
      const beforeEnd = axis === "x" ? before.bounds.right : before.bounds.bottom;
      const afterStart = axis === "x" ? after.bounds.left : after.bounds.top;
      if (beforeEnd > start || afterStart < end) continue;
      const gapBefore = start - beforeEnd;
      const gapAfter = afterStart - end;
      const delta = (gapAfter - gapBefore) / 2;
      if (Math.abs(delta) > tolerance) continue;
      const position = axis === "x" ? moving.centerY : moving.centerX;
      guides.push({
        axis, kind: "spacing", delta, distance: Math.abs(delta),
        position,
        start: beforeEnd,
        end: afterStart,
        gap: (gapBefore + gapAfter) / 2,
      });
    }
  }
  return guides.sort((a, b) => a.distance - b.distance).slice(0, 2);
}

/** Approximate text baseline from Excalidraw's text box and font size. */
export function getTextBaseline(element) {
  if (!isVisible(element) || element.type !== "text") return null;
  const box = getElementBounds(element);
  const fontSize = Math.max(1, Number(element.fontSize) || 20);
  return box.bottom - fontSize * 0.22;
}

/** Detect baseline alignment between selected and stationary text elements. */
export function calculateTextBaselineGuides(elements, selectedIds, tolerance = ALIGNMENT_TOLERANCE) {
  if (!Array.isArray(elements) || !(selectedIds instanceof Set) || !selectedIds.size) return [];
  const moving = elements.filter((element) => isVisible(element) && selectedIds.has(element.id) && element.type === "text");
  const stationary = elements.filter((element) => isVisible(element) && !selectedIds.has(element.id) && element.type === "text");
  const guides = [];
  for (const a of moving) for (const b of stationary) {
    const baselineA = getTextBaseline(a);
    const baselineB = getTextBaseline(b);
    if (baselineA == null || baselineB == null || Math.abs(baselineA - baselineB) > tolerance) continue;
    const left = Math.min(Number(a.x) || 0, Number(b.x) || 0);
    const right = Math.max((Number(a.x) || 0) + (Number(a.width) || 0), (Number(b.x) || 0) + (Number(b.width) || 0));
    guides.push({ axis: "y", kind: "baseline", position: baselineB, start: left - 8, end: right + 8, distance: Math.abs(baselineA - baselineB) });
  }
  return guides;
}

/** Coordinates relative to the Excalidraw viewport, not the browser window. */
export function sceneToCanvasPixel(value, scroll, zoom) {
  return ((Number(value) || 0) + (Number(scroll) || 0)) * (Number(zoom) || 1);
}

/** Spacing guides span the gap, perpendicular to the measured axis. */
export function getGuideRenderAxis(guide) {
  if (guide.kind === "spacing") return guide.axis === "x" ? "y" : "x";
  return guide.axis;
}

/**
 * Render at most one guide per axis. Baselines win over ordinary horizontal
 * alignment; spacing is shown only when there is no competing axis guide.
 */
export function selectDisplayGuides(guides) {
  if (!Array.isArray(guides)) return [];
  return ["x", "y"].map((axis) => guides
    .filter((guide) => getGuideRenderAxis(guide) === axis)
    .sort((a, b) => {
      const priority = (guide) => guide.kind === "baseline" ? 0
        : guide.kind === "alignment" ? 1 : 2;
      return priority(a) - priority(b) || a.distance - b.distance;
    })[0]).filter(Boolean);
}

/* ------------------------------------------------------------------------
   Pre-placement guides: shown while a creation tool is active and the cursor
   hovers the canvas (before any click). All coordinates are scene space.
   ------------------------------------------------------------------------ */
export const PLACEMENT_GUIDE_TOLERANCE = 6;
export const PLACEMENT_VERTICAL_WINDOW = 320;
export const PLACEMENT_HORIZONTAL_WINDOW = 480;
export const PLACEMENT_INDENT_STEPS = Object.freeze([24, 32]);
export const PLACEMENT_TOOLS = new Set(["text", "line", "arrow", "rectangle", "diamond", "ellipse"]);
/** Tools whose first click/press magnetically snaps to the guide. */
export const PLACEMENT_SNAP_TOOLS = new Set(["text", "line", "arrow"]);
/** Tools that also get horizontal (Y) guides. */
const PLACEMENT_Y_TOOLS = new Set(["line", "arrow"]);
const PLACEMENT_REFERENCE_TYPES = new Set(["text", "line", "arrow", "rectangle", "diamond", "ellipse"]);
const MAX_VERTEX_REFERENCES = 32;

const EMPTY_PLACEMENT = Object.freeze({ active: false, snappedX: null, snappedY: null, x: null, y: null });

function vertexPoints(element) {
  if (!Array.isArray(element.points)) return [];
  const ox = Number(element.x) || 0;
  const oy = Number(element.y) || 0;
  const points = element.points
    .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map((point) => [ox + Number(point[0]), oy + Number(point[1])]);
  if (points.length <= MAX_VERTEX_REFERENCES) return points;
  const step = points.length / MAX_VERTEX_REFERENCES;
  return Array.from({ length: MAX_VERTEX_REFERENCES }, (_, index) => points[Math.floor(index * step)]);
}

function referenceBounds(element, points) {
  if (points.length) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const left = Math.min(...xs); const right = Math.max(...xs);
    const top = Math.min(...ys); const bottom = Math.max(...ys);
    return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
  }
  const b = getElementBounds(element);
  return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, centerX: b.centerX, centerY: b.centerY };
}

/** Nearby, visible elements the cursor can align with. */
export function collectPlacementReferences(elements, cursor, { verticalWindow = PLACEMENT_VERTICAL_WINDOW, horizontalWindow = PLACEMENT_HORIZONTAL_WINDOW } = {}) {
  if (!Array.isArray(elements)) return [];
  const refs = [];
  for (const element of elements) {
    if (!isVisible(element) || !PLACEMENT_REFERENCE_TYPES.has(element.type)) continue;
    // Text bound inside a container is positioned by the container, not freely.
    if (element.type === "text" && element.containerId) continue;
    const points = element.type === "line" || element.type === "arrow" ? vertexPoints(element) : [];
    const bounds = referenceBounds(element, points);
    if (bounds.bottom < cursor.y - verticalWindow || bounds.top > cursor.y + verticalWindow) continue;
    if (bounds.right < cursor.x - horizontalWindow || bounds.left > cursor.x + horizontalWindow) continue;
    const xs = points.length ? points.map((p) => p[0]) : [bounds.left];
    const ys = [bounds.top, bounds.centerY, bounds.bottom];
    if (points.length) for (const p of points) ys.push(p[1]);
    refs.push({ id: element.id, type: element.type, bounds, xs, ys, indentable: element.type === "text" });
  }
  return refs;
}

const bandDistance = (value, start, end) => (value < start ? start - value : value > end ? value - end : 0);

function pickBest(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (!best) { best = candidate; continue; }
    if (candidate.distance < best.distance - 0.5) best = candidate;
    else if (Math.abs(candidate.distance - best.distance) <= 0.5) {
      if (candidate.band < best.band - 0.5) best = candidate;
      else if (Math.abs(candidate.band - best.band) <= 0.5 && candidate.offset < best.offset) best = candidate;
    }
  }
  return best;
}

/**
 * Compute the alignment the cursor would snap to if the user clicked now.
 * Returns `{ active, snappedX, snappedY, x, y }`; `x` is a vertical guide
 * (left-edge or indent step), `y` a horizontal guide (line/arrow only).
 */
export function calculatePlacementGuides(elements, cursor, options = {}) {
  const { tool, tolerance = PLACEMENT_GUIDE_TOLERANCE, indentSteps = PLACEMENT_INDENT_STEPS } = options;
  if (!PLACEMENT_TOOLS.has(tool) || !cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return EMPTY_PLACEMENT;
  const refs = collectPlacementReferences(elements, cursor, options);
  if (!refs.length) return EMPTY_PLACEMENT;

  const xCandidates = [];
  for (const ref of refs) {
    const band = bandDistance(cursor.y, ref.bounds.top, ref.bounds.bottom);
    for (const x of ref.xs) {
      const distance = Math.abs(cursor.x - x);
      if (distance <= tolerance) xCandidates.push({ ref, kind: "left", offset: 0, position: x, distance, band });
      if (ref.indentable) for (const step of indentSteps) {
        const target = x + step;
        const d = Math.abs(cursor.x - target);
        if (d <= tolerance) xCandidates.push({ ref, kind: "indent", offset: step, position: target, distance: d, band });
      }
    }
  }
  const bestX = pickBest(xCandidates);

  let bestY = null;
  if (PLACEMENT_Y_TOOLS.has(tool)) {
    const yCandidates = [];
    for (const ref of refs) {
      const band = bandDistance(cursor.x, ref.bounds.left, ref.bounds.right);
      ref.ys.forEach((y, index) => {
        const distance = Math.abs(cursor.y - y);
        if (distance > tolerance) return;
        yCandidates.push({ ref, kind: index === 1 ? "center" : "edge", offset: index === 1 ? 0 : 1, position: y, distance, band });
      });
    }
    bestY = pickBest(yCandidates);
  }

  if (!bestX && !bestY) return EMPTY_PLACEMENT;
  const snappedX = bestX ? bestX.position : cursor.x;
  const snappedY = bestY ? bestY.position : cursor.y;

  let x = null;
  if (bestX) {
    const { top, bottom } = bestX.ref.bounds;
    x = {
      axis: "x", kind: bestX.kind, position: bestX.position, offset: bestX.offset,
      parentLeft: bestX.position - bestX.offset, refId: bestX.ref.id, distance: bestX.distance,
      start: snappedY >= bottom ? top : snappedY <= top ? snappedY : top,
      end: snappedY >= bottom ? snappedY : snappedY <= top ? bottom : bottom,
      label: bestX.kind === "indent" ? `Indent +${bestX.offset}px` : "Align Left",
    };
    if (snappedY >= top && snappedY < bottom) x.end = Math.max(bottom, snappedY);
  }
  let y = null;
  if (bestY) {
    const { left, right } = bestY.ref.bounds;
    y = {
      axis: "y", kind: bestY.kind, position: bestY.position, refId: bestY.ref.id, distance: bestY.distance,
      start: snappedX >= right ? left : snappedX <= left ? snappedX : left,
      end: snappedX >= right ? snappedX : snappedX <= left ? right : right,
      label: bestY.kind === "center" ? "Center Y" : "Align Y",
    };
  }
  return { active: true, snappedX, snappedY, x, y };
}

/** Client (window) pixels -> scene coordinates for a given viewport. */
export function clientToScene(clientX, clientY, viewportRect, appState) {
  const zoom = Math.max(0.1, Number(appState?.zoom?.value ?? appState?.zoom) || 1);
  return {
    x: (clientX - viewportRect.left) / zoom - (Number(appState?.scrollX) || 0),
    y: (clientY - viewportRect.top) / zoom - (Number(appState?.scrollY) || 0),
    zoom,
  };
}
