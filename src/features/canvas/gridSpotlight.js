// Pure geometry for Sketchizi's non-interactive, two-level workspace grid.
// These are CSS pixels, not physical centimeters; Excalidraw's snap settings
// and document data remain entirely independent.
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const modulo = (value, step) => ((value % step) + step) % step;

export function spotlightCenter(x, y, width, height) {
  const w = Math.max(0, finite(width));
  const h = Math.max(0, finite(height));
  return {
    x: Math.round(clamp(finite(x, w / 2), 0, w)),
    y: Math.round(clamp(finite(y, h / 2), 0, h)),
  };
}

export function spotlightElementCenter(element, state) {
  if (!element || element.isDeleted || element.deleted) return null;
  const zoom = finite(state?.zoom?.value ?? state?.zoom, 1);
  if (zoom <= 0) return null;
  return {
    x: (finite(element.x) + finite(element.width) / 2 + finite(state?.scrollX)) * zoom,
    y: (finite(element.y) + finite(element.height) / 2 + finite(state?.scrollY)) * zoom,
  };
}

// Keep both grid tiers pinned to a common scene origin as the canvas pans and zooms.
export function spotlightGridPattern(state) {
  const zoom = Math.max(0.01, finite(state?.zoom?.value ?? state?.zoom, 1));
  const size = clamp(finite(state?.gridSize, 20), 5, 100);
  const spacing = clamp(size * zoom, 8, 72);
  return {
    spacing,
    offsetX: modulo(finite(state?.scrollX) * zoom, spacing),
    offsetY: modulo(finite(state?.scrollY) * zoom, spacing),
  };
}

export function workspaceCoarseGridPattern(state) {
  const fine = spotlightGridPattern(state);
  const zoom = Math.max(0.01, finite(state?.zoom?.value ?? state?.zoom, 1));
  const spacing = fine.spacing * 4;
  return {
    spacing,
    offsetX: modulo(finite(state?.scrollX) * zoom, spacing),
    offsetY: modulo(finite(state?.scrollY) * zoom, spacing),
  };
}

/**
 * The fine grid is a softly edged RECTANGLE surrounding drawing content.
 * The outer coarse grid always fills the entire canvas, including empty scenes.
 * Focus favors the currently selected elements, otherwise visible scene bounds.
 * Pointer anchors are used only during an actual drawing/editing gesture.
 */
export function workspaceFocusRect({
  elements = [],
  selectedElements = [],
  state = {},
  width,
  height,
  anchor = null,
} = {}) {
  const w = Math.max(0, finite(width));
  const h = Math.max(0, finite(height));
  if (!w || !h) return null;
  const zoom = Math.max(0.01, finite(state?.zoom?.value ?? state?.zoom, 1));
  const visible = (selectedElements.length ? selectedElements : elements)
    .filter((element) => element && !element.isDeleted && !element.deleted &&
      Number.isFinite(element.x) && Number.isFinite(element.y));
  if (!visible.length && !anchor) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of visible) {
    const x1 = (element.x + finite(state?.scrollX)) * zoom;
    const y1 = (element.y + finite(state?.scrollY)) * zoom;
    const x2 = x1 + Math.abs(finite(element.width)) * zoom;
    const y2 = y1 + Math.abs(finite(element.height)) * zoom;
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }
  // A pointer or text caret is only an anchor while editing, never on hover.
  const focusX = anchor
    ? finite(anchor.x, w / 2)
    : visible.length ? (minX + maxX) / 2 : w / 2;
  const focusY = anchor
    ? finite(anchor.y, h / 2)
    : visible.length ? (minY + maxY) / 2 : h / 2;
  const objectW = visible.length ? maxX - minX : 0;
  const objectH = visible.length ? maxY - minY : 0;
  const maxW = w * 0.88;
  const maxH = h * 0.82;
  // Rectangular detail should extend beyond the content and remain comfortably
  // large for one text element; it must not expand to cover the whole viewport.
  const detailW = Math.round(Math.min(maxW, Math.max(Math.min(650, w * 0.72), objectW + 160)));
  const detailH = Math.round(Math.min(maxH, Math.max(Math.min(390, h * 0.65), objectH + 140)));
  const left = Math.round(clamp(focusX - detailW / 2, 0, Math.max(0, w - detailW)));
  const top = Math.round(clamp(focusY - detailH / 2, 0, Math.max(0, h - detailH)));
  return { left, top, width: detailW, height: detailH };
}
