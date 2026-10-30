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
      const relevantMoving = movingBounds.filter((moving) => {
        const overlap = axis === "x"
          ? Math.min(moving.bottom, target.bottom) - Math.max(moving.top, target.top)
          : Math.min(moving.right, target.right) - Math.max(moving.left, target.left);
        const reach = axis === "x" ? Math.min(moving.height, target.height) : Math.min(moving.width, target.width);
        return overlap >= -Math.max(4, reach * 0.15);
      });
      if (!relevantMoving.length) continue;
      const closest = relevantMoving.flatMap((moving) => {
        const edges = axis === "x"
          ? [moving.left, moving.centerX, moving.right]
          : [moving.top, moving.centerY, moving.bottom];
        return edges.map((edge) => ({ edge, distance: Math.abs(edge - value) }));
      }).filter((candidate) => candidate.distance <= tolerance)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!closest) continue;
      const position = value;
      const key = axis + ":" + Math.round(position * 100) / 100;
      if (seen.has(key)) continue;
      seen.add(key);
      const aligned = relevantMoving.concat([target]);
      const start = axis === "x" ? Math.min(...aligned.map((b) => b.top)) - 12 : Math.min(...aligned.map((b) => b.left)) - 12;
      const end = axis === "x" ? Math.max(...aligned.map((b) => b.bottom)) + 12 : Math.max(...aligned.map((b) => b.right)) + 12;
      guides.push({ axis, position, start, end, distance: closest.distance });
    }
  }
  return guides;
}
