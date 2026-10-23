const LINEAR_TYPES = new Set(["line", "arrow"]);
const RESIZABLE_SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

function snap(value, step) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Math.round(number / step) * step;
}

function close(a, b, epsilon = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < epsilon;
}

function geometryChanged(element, before) {
  return !close(element.x, before.x) || !close(element.y, before.y) ||
    !close(element.width, before.width) || !close(element.height, before.height) ||
    !close(element.angle, before.angle);
}

function sameSize(element, before) {
  return close(element.width, before.width) && close(element.height, before.height) && close(element.angle, before.angle);
}

function snapLinearElement(element, step) {
  const x = snap(element.x, step);
  const y = snap(element.y, step);
  if (!Array.isArray(element.points) || element.points.length === 0) return { ...element, x, y };
  return {
    ...element,
    x,
    y,
    points: element.points.map((point) => {
      if (!Array.isArray(point) || point.length < 2) return point;
      const worldX = snap((Number(element.x) || 0) + (Number(point[0]) || 0), step);
      const worldY = snap((Number(element.y) || 0) + (Number(point[1]) || 0), step);
      return [worldX - x, worldY - y, ...point.slice(2)];
    }),
  };
}

function applySnapToNewElement(element, step) {
  if (LINEAR_TYPES.has(element.type)) return snapLinearElement(element, step);
  const patch = { ...element, x: snap(element.x, step), y: snap(element.y, step) };
  if (RESIZABLE_SHAPE_TYPES.has(element.type)) {
    patch.width = Math.max(1, snap(element.width, step));
    patch.height = Math.max(1, snap(element.height, step));
  }
  return patch;
}

function applySnapToChangedElement(element, before, step) {
  if (LINEAR_TYPES.has(element.type)) return snapLinearElement(element, step);
  const patch = { ...element, x: snap(element.x, step), y: snap(element.y, step) };
  if (!close(element.width, before.width)) patch.width = Math.max(1, snap(element.width, step));
  if (!close(element.height, before.height)) patch.height = Math.max(1, snap(element.height, step));
  return patch;
}

/**
 * Snap only geometries changed by the just-finished pointer gesture. Existing
 * multi-selection moves retain their relative spacing by sharing one snapped
 * translation. Returns the original array when no snap correction is needed.
 */
export function snapChangedSceneElements(elements, baseline, gridSize = 20) {
  const step = Math.max(5, Math.min(100, Number(gridSize) || 20));
  if (!Array.isArray(elements) || !(baseline instanceof Map)) return elements;

  const changed = elements.filter((element) => element && !element.isDeleted && !element.deleted).map((element) => ({
    element,
    before: baseline.get(element.id),
  })).filter(({ element, before }) => !before || geometryChanged(element, before));
  if (!changed.length) return elements;

  const areCommonMove = changed.every(({ element, before }) => before && sameSize(element, before) &&
    (!close(element.x, before.x) || !close(element.y, before.y)));
  let groupDelta = null;
  if (areCommonMove) {
    const first = changed[0];
    const deltaX = first.element.x - first.before.x;
    const deltaY = first.element.y - first.before.y;
    const sharedDelta = changed.every(({ element, before }) => close(element.x - before.x, deltaX) && close(element.y - before.y, deltaY));
    if (sharedDelta) {
      groupDelta = {
        x: snap(first.element.x, step) - first.element.x,
        y: snap(first.element.y, step) - first.element.y,
      };
    }
  }

  let changedAny = false;
  const nextElements = elements.map((element) => {
    if (!element || element.isDeleted || element.deleted) return element;
    const before = baseline.get(element.id);
    let next;
    if (!before) {
      next = applySnapToNewElement(element, step);
    } else if (!geometryChanged(element, before)) {
      return element;
    } else if (groupDelta && sameSize(element, before)) {
      next = { ...element, x: element.x + groupDelta.x, y: element.y + groupDelta.y };
    } else {
      next = applySnapToChangedElement(element, before, step);
    }

    const didChange = !close(next.x, element.x) || !close(next.y, element.y) ||
      !close(next.width, element.width) || !close(next.height, element.height) ||
      (next.points && element.points && next.points.some((point, index) =>
        !Array.isArray(element.points[index]) || !close(point?.[0], element.points[index]?.[0]) || !close(point?.[1], element.points[index]?.[1])));
    if (!didChange) return element;
    changedAny = true;
    return {
      ...next,
      version: (Number(element.version) || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    };
  });

  return changedAny ? nextElements : elements;
}
