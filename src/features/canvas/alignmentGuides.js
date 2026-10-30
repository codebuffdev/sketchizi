const ALIGNMENT_TOLERANCE = 7;

function isVisible(element) {
  return element && !element.isDeleted && !element.deleted &&
    Number.isFinite(Number(element.x)) && Number.isFinite(Number(element.y)) &&
    Number.isFinite(Number(element.width)) && Number.isFinite(Number(element.height));
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

const anchors = (start, size) => [start, start + size / 2, start + size];

/** Finds nearest edge/center alignments. All distances and tolerances are scene-space. */
export function findNearestAlignment(moving, stationary, axis, tolerance) {
  let best = null;
  for (const a of moving) {
    const ab = getElementBounds(a);
    for (const b of stationary) {
      const bb = getElementBounds(b);
      const perpendicularOverlap = axis === "x"
        ? overlaps(ab.top, ab.bottom, bb.top, bb.bottom)
        : overlaps(ab.left, ab.right, bb.left, bb.right);
      if (!perpendicularOverlap) continue;
      const from = anchors(axis === "x" ? ab.left : ab.top, axis === "x" ? ab.width : ab.height);
      const to = anchors(axis === "x" ? bb.left : bb.top, axis === "x" ? bb.width : bb.height);
      for (const source of from) for (const target of to) {
        const delta = target - source;
        if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, position: target };
        }
      }
    }
  }
  return best;
}

/** Detects when moving an object would make two neighboring gaps equal. */
export function findNearestEqualSpacing(moving, stationary, axis, tolerance) {
  let best = null;
  const stationaryBounds = stationary.map((element) => getElementBounds(element));
  for (const item of moving) {
    const mb = getElementBounds(item);
    const itemStart = axis === "x" ? mb.left : mb.top;
    const itemEnd = axis === "x" ? mb.right : mb.bottom;
    const itemSize = axis === "x" ? mb.width : mb.height;
    const candidates = stationaryBounds
      .filter((b) => axis === "x"
        ? overlaps(mb.top, mb.bottom, b.top, b.bottom)
        : overlaps(mb.left, mb.right, b.left, b.right))
      .map((b) => ({ start: axis === "x" ? b.left : b.top, end: axis === "x" ? b.right : b.bottom }))
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const left = candidates[i];
        const right = candidates[j];
        if (right.start < left.end) continue;
        const targetStart = (left.end + right.start - itemSize) / 2;
        const delta = targetStart - itemStart;
        if (Math.abs(delta) > tolerance || (best && Math.abs(delta) >= Math.abs(best.delta))) continue;
        best = {
          delta,
          position: targetStart,
          edge: "start",
          gap: (right.start - left.end - itemSize) / 2,
          axis,
          itemId: item.id,
        };
      }
    }
    // Keep itemEnd referenced so malformed zero-size elements cannot produce
    // a misleading spacing candidate.
    if (itemEnd < itemStart) continue;
  }
  return best;
}

export function calculateAlignmentGuides(elements, selectedIds, tolerance = ALIGNMENT_TOLERANCE) {
  if (!Array.isArray(elements) || !(selectedIds instanceof Set) || !selectedIds.size) return [];
  const moving = elements.filter((element) => isVisible(element) && selectedIds.has(element.id));
  const stationary = elements.filter((element) => isVisible(element) && !selectedIds.has(element.id));
  if (!moving.length || !stationary.length) return [];

  const movingBounds = moving.map(getElementBounds);
  const stationaryBounds = stationary.map(getElementBounds);
  const movingEdges = {
    x: [...new Set(movingBounds.flatMap((b) => [b.left, b.centerX, b.right]))],
    y: [...new Set(movingBounds.flatMap((b) => [b.top, b.centerY, b.bottom]))],
  };
  const guides = [];
  const seen = new Set();
  for (const target of stationaryBounds) {
    for (const [axis, value] of [
      ["x", target.left], ["x", target.centerX], ["x", target.right],
      ["y", target.top], ["y", target.centerY], ["y", target.bottom],
    ]) {
      const closest = movingEdges[axis].reduce((best, edge) => {
        const distance = Math.abs(edge - value);
        return distance <= tolerance && (!best || distance < best.distance) ? { edge, distance } : best;
      }, null);
      if (!closest) continue;
      const key = axis + ":" + Math.round(value * 100) / 100;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = axis === "x" ? Math.min(...movingBounds.concat([target]).map((b) => b.top)) - 12 : Math.min(...movingBounds.concat([target]).map((b) => b.left)) - 12;
      const end = axis === "x" ? Math.max(...movingBounds.concat([target]).map((b) => b.bottom)) + 12 : Math.max(...movingBounds.concat([target]).map((b) => b.right)) + 12;
      guides.push({ axis, position: value, start, end, kind: "alignment", distance: closest.distance });
    }
  }
  return guides;
}
