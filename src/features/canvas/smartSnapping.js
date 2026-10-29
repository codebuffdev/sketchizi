const DEFAULT_SNAP_TOLERANCE = 8;

function visible(element) {
  return element && !element.isDeleted && !element.deleted &&
    Number.isFinite(Number(element.x)) && Number.isFinite(Number(element.y));
}

function getBounds(element) {
  const left = Number(element.x) || 0;
  const top = Number(element.y) || 0;
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  return {
    left, right: left + width, centerX: left + width / 2,
    top, bottom: top + height, centerY: top + height / 2,
    width, height,
  };
}

function near(a, b, epsilon = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= epsilon;
}

/**
 * Snap a just-moved selection to nearby edges/centers or equal spacing.
 * Only translates the selection, preserving sizes and relative positions.
 */
export function snapSceneElementsToSmartGuides(elements, baseline, selectedIds, tolerance = DEFAULT_SNAP_TOLERANCE) {
  if (!Array.isArray(elements) || !(baseline instanceof Map) || !(selectedIds instanceof Set) || !selectedIds.size) return elements;
  const selected = elements.filter((element) => visible(element) && selectedIds.has(element.id) && baseline.has(element.id));
  const stationary = elements.filter((element) => visible(element) && !selectedIds.has(element.id));
  if (!selected.length || !stationary.length) return elements;

  const before = selected.map((element) => baseline.get(element.id));
  const moved = selected.some((element, index) =>
    !near(element.x, before[index].x) || !near(element.y, before[index].y));
  if (!moved) return elements;

  const movingBounds = selected.map(getBounds);
  const fixedBounds = stationary.map((element) => ({ element, ...getBounds(element) }));
  const moving = {
    left: Math.min(...movingBounds.map((b) => b.left)),
    right: Math.max(...movingBounds.map((b) => b.right)),
    top: Math.min(...movingBounds.map((b) => b.top)),
    bottom: Math.max(...movingBounds.map((b) => b.bottom)),
  };
  moving.width = moving.right - moving.left;
  moving.height = moving.bottom - moving.top;
  moving.centerX = (moving.left + moving.right) / 2;
  moving.centerY = (moving.top + moving.bottom) / 2;

  const bestDelta = (axis) => {
    const isX = axis === "x";
    const movingEdges = isX
      ? [moving.left, moving.centerX, moving.right]
      : [moving.top, moving.centerY, moving.bottom];
    const fixedEdges = fixedBounds.flatMap((b) => isX
      ? [b.left, b.centerX, b.right]
      : [b.top, b.centerY, b.bottom]);
    const candidates = [];
    for (const edge of movingEdges) for (const target of fixedEdges) {
      const delta = target - edge;
      if (Math.abs(delta) <= tolerance) candidates.push({ delta, distance: Math.abs(delta), kind: "edge" });
    }

    // When the selection is between two elements on the same row/column,
    // prefer a translation that makes the two gaps equal.
    for (let i = 0; i < fixedBounds.length; i++) {
      for (let j = i + 1; j < fixedBounds.length; j++) {
        const a = fixedBounds[i];
        const b = fixedBounds[j];
        if (isX) {
          const sameRow = Math.min(moving.bottom, a.bottom, b.bottom) -
            Math.max(moving.top, a.top, b.top) > -Math.min(moving.height, a.height, b.height) * 0.25;
          if (!sameRow) continue;
          const left = a.right <= moving.left && b.left >= moving.right ? a : b.right <= moving.left && a.left >= moving.right ? b : null;
          const right = left === a ? b : left === b ? a : null;
          if (!left || !right) continue;
          const targetLeft = (left.right + right.left - moving.width) / 2;
          const delta = targetLeft - moving.left;
          if (Math.abs(delta) <= tolerance) candidates.push({ delta, distance: Math.abs(delta), kind: "spacing" });
        } else {
          const sameColumn = Math.min(moving.right, a.right, b.right) -
            Math.max(moving.left, a.left, b.left) > -Math.min(moving.width, a.width, b.width) * 0.25;
          if (!sameColumn) continue;
          const top = a.bottom <= moving.top && b.top >= moving.bottom ? a : b.bottom <= moving.top && a.top >= moving.bottom ? b : null;
          const bottom = top === a ? b : top === b ? a : null;
          if (!top || !bottom) continue;
          const targetTop = (top.bottom + bottom.top - moving.height) / 2;
          const delta = targetTop - moving.top;
          if (Math.abs(delta) <= tolerance) candidates.push({ delta, distance: Math.abs(delta), kind: "spacing" });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || (a.kind === "spacing" ? -1 : 1));
    return candidates[0]?.delta || 0;
  };

  const deltaX = bestDelta("x");
  const deltaY = bestDelta("y");
  if (near(deltaX, 0) && near(deltaY, 0)) return elements;
  let changed = false;
  const next = elements.map((element) => {
    if (!selectedIds.has(element.id) || !visible(element)) return element;
    changed = true;
    return {
      ...element,
      x: (Number(element.x) || 0) + deltaX,
      y: (Number(element.y) || 0) + deltaY,
      version: (Number(element.version) || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    };
  });
  return changed ? next : elements;
}
