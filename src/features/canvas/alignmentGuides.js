const ALIGNMENT_TOLERANCE = 7;

function isVisible(element) {
  return element && !element.isDeleted && !element.deleted && Number.isFinite(Number(element.x)) && Number.isFinite(Number(element.y));
}

function bounds(element) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  return { left: x, right: x + width, centerX: x + width / 2, top: y, bottom: y + height, centerY: y + height / 2 };
}

/**
 * Finds near-matching left/right/center and top/bottom/center edges.
 * Coordinates are scene-space; tolerance is supplied in scene units.
 */
export function calculateAlignmentGuides(elements, selectedIds, tolerance = ALIGNMENT_TOLERANCE) {
  if (!Array.isArray(elements) || !(selectedIds instanceof Set) || !selectedIds.size) return [];
  const moving = elements.filter((element) => isVisible(element) && selectedIds.has(element.id));
  const stationary = elements.filter((element) => isVisible(element) && !selectedIds.has(element.id));
  if (!moving.length || !stationary.length) return [];

  const movingBounds = moving.map(bounds);
  const stationaryBounds = stationary.map((element) => ({ element, bounds: bounds(element) }));
  const movingEdges = {
    x: [...new Set(movingBounds.flatMap((b) => [b.left, b.centerX, b.right]))],
    y: [...new Set(movingBounds.flatMap((b) => [b.top, b.centerY, b.bottom]))],
  };
  const guides = [];
  const seen = new Set();
  for (const { bounds: target } of stationaryBounds) {
    const targets = [
      ["x", target.left], ["x", target.centerX], ["x", target.right],
      ["y", target.top], ["y", target.centerY], ["y", target.bottom],
    ];
    for (const [axis, value] of targets) {
      const closest = movingEdges[axis].reduce((best, edge) => {
        const distance = Math.abs(edge - value);
        return distance <= tolerance && (!best || distance < best.distance) ? { edge, distance } : best;
      }, null);
      if (!closest) continue;
      const position = value;
      const key = axis + ":" + Math.round(position * 100) / 100;
      if (seen.has(key)) continue;
      seen.add(key);
      const aligned = movingBounds.concat([target]);
      const start = axis === "x" ? Math.min(...aligned.map((b) => b.top)) - 12 : Math.min(...aligned.map((b) => b.left)) - 12;
      const end = axis === "x" ? Math.max(...aligned.map((b) => b.bottom)) + 12 : Math.max(...aligned.map((b) => b.right)) + 12;
      guides.push({ axis, position, start, end, distance: closest.distance });
    }
  }
  return guides;
}
