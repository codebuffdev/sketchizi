/**
 * Smart vertical spacing, equal-interval snapping and left-edge alignment for
 * stacked elements. Pure scene-space math (no DOM), so it is unit-testable.
 */
export const SPACING_SNAP_THRESHOLD = 6; // screen px; divided by zoom for scene px
export const SPACING_COLOR = "#6366F1";
export const EQUAL_SPACING_COLOR = "#EC4899";
export const TICK_HALF = 3.5; // 7px T-cap
export const KEYBOARD_GUIDE_MS = 750;

const finite = (v) => Number.isFinite(Number(v));

export function boxOf(element) {
  const left = Number(element.x) || 0;
  const top = Number(element.y) || 0;
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/** Visible, unlocked, freely positioned elements (bound text follows its container). */
export function isSpacingCandidate(element) {
  return Boolean(element) && !element.isDeleted && !element.deleted && !element.locked &&
    !(element.type === "text" && element.containerId) &&
    finite(element.x) && finite(element.y);
}

const overlapsHorizontally = (a, b) => Math.max(a.left, b.left) < Math.min(a.right, b.right);

/** Nearest element strictly above `box` that overlaps it horizontally. */
export function findElementAbove(box, others) {
  let best = null;
  for (const entry of others) {
    if (entry.box.bottom > box.top || !overlapsHorizontally(entry.box, box)) continue;
    if (!best || entry.box.bottom > best.box.bottom) best = entry;
  }
  return best;
}

/**
 * @param {object[]} elements scene elements
 * @param {string} activeId   element being dragged / nudged
 * @param {{zoom?:number, snap?:boolean}} options
 * @returns {null | {x:number,y:number,snapped:boolean,gap:number|null,referenceGap:number|null,
 *   isEqualSpacing:boolean,guideX:number|null,prev:object|null,prevPrev:object|null,
 *   active:object,leftGuide:object|null}}
 */
export function calculateVerticalSpacing(elements, activeId, { zoom = 1, snap = true } = {}) {
  if (!Array.isArray(elements)) return null;
  const activeEl = elements.find((el) => el.id === activeId);
  if (!activeEl || !isSpacingCandidate(activeEl)) return null;
  const threshold = SPACING_SNAP_THRESHOLD / Math.max(0.01, Number(zoom) || 1);
  const others = elements
    .filter((el) => el.id !== activeId && isSpacingCandidate(el))
    .map((el) => ({ id: el.id, box: boxOf(el) }));
  let active = boxOf(activeEl);
  const origin = { x: active.left, y: active.top };
  const shift = (dx, dy) => {
    active = { ...active, left: active.left + dx, right: active.right + dx, top: active.top + dy, bottom: active.bottom + dy };
  };

  // 1. Left-edge alignment (snap x first: it changes which elements overlap).
  let leftTarget = null;
  for (const entry of others) {
    const d = Math.abs(entry.box.left - active.left);
    if (d > threshold) continue;
    const v = Math.abs(entry.box.top - active.top);
    if (!leftTarget || d < leftTarget.d - 1e-6 || (Math.abs(d - leftTarget.d) <= 1e-6 && v < leftTarget.v)) leftTarget = { entry, d, v };
  }
  if (leftTarget && snap) shift(leftTarget.entry.box.left - active.left, 0);

  // 2. Immediately preceding element and equal-interval reference.
  const prev = findElementAbove(active, others);
  let gap = null; let referenceGap = null; let prevPrev = null;
  let isEqualSpacing = false;
  if (prev) {
    gap = active.top - prev.box.bottom;
    prevPrev = findElementAbove(prev.box, others.filter((o) => o.id !== prev.id));
    if (prevPrev) {
      referenceGap = prev.box.top - prevPrev.box.bottom;
      if (Math.abs(gap - referenceGap) <= threshold) {
        if (snap) { shift(0, prev.box.bottom + referenceGap - active.top); gap = referenceGap; }
        isEqualSpacing = true;
      }
    }
  }

  const leftGuide = leftTarget && Math.abs(leftTarget.entry.box.left - active.left) < 0.01
    ? {
      x: leftTarget.entry.box.left,
      y1: Math.min(active.top, leftTarget.entry.box.top),
      y2: Math.max(active.bottom, leftTarget.entry.box.bottom),
    } : null;
  const guideX = prev ? (Math.max(prev.box.left, active.left) + Math.min(prev.box.right, active.right)) / 2 : null;
  return {
    x: active.left, y: active.top,
    snapped: Math.abs(active.left - origin.x) > 0.01 || Math.abs(active.top - origin.y) > 0.01,
    gap, referenceGap, isEqualSpacing, guideX,
    prev: prev ? prev.box : null, prevPrev: prevPrev ? prevPrev.box : null,
    active, leftGuide,
  };
}

export const formatGapLabel = (gap) => (gap < 20 ? `${Math.round(gap)}` : `${Math.round(gap)}px`);
