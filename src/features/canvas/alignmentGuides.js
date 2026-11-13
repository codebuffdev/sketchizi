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
        if (axis === "x" && !overlaps(movingBox.top, movingBox.bottom, target.top, target.bottom)) continue;
        if (axis === "y" && !overlaps(movingBox.left, movingBox.right, target.left, target.right)) continue;
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
  return guides;
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
        start: axis === "x" ? beforeEnd : crossStart,
        end: axis === "x" ? afterStart : crossEnd,
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
