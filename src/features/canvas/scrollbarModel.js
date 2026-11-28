/**
 * Content-bounded scroll model for the floating canvas scrollbars.
 *
 * Excalidraw's camera: screenX = (sceneX + scrollX) * zoom, so the scene-space
 * range currently visible on an axis is [-scroll, -scroll + viewportPx / zoom].
 * Framework-free so every rule below can be unit-tested in plain Node.
 */

export const CONTENT_PADDING = 120; // world units of breathing room around the artwork
export const MIN_THUMB_PX = 36;
export const FIT_EPSILON_PX = 0.5; // sub-pixel slack so an exactly-fitting drawing is "fitting"

const isLive = (el) => el && !el.isDeleted && !el.deleted;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Axis-aligned bounds of one element, honouring rotation. */
export function elementBounds(el) {
  const x = num(el.x);
  const y = num(el.y);
  const w = Math.abs(num(el.width));
  const h = Math.abs(num(el.height));
  const angle = num(el.angle);
  if (!angle) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xs = [];
  const ys = [];
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    xs.push(cx + (px - cx) * cos - (py - cy) * sin);
    ys.push(cy + (px - cx) * sin + (py - cy) * cos);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Combined world-space bounding box of every visible element, padded by `padding`.
 * Returns null for an empty canvas (no live elements).
 */
export function computeContentBounds(elements, padding = CONTENT_PADDING) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const el of elements || []) {
    if (!isLive(el)) continue;
    const b = elementBounds(el);
    if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) continue;
    count += 1;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!count) return null;
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

/**
 * One axis of the scrollbar.
 *   min/max     padded content extent on this axis (world units), or null when empty
 *   scroll      Excalidraw appState.scrollX / scrollY
 *   viewportPx  size of the canvas on this axis in CSS pixels
 *   zoom        appState.zoom.value
 *
 * enabled = false when the canvas is empty or the (padded) content fits the viewport.
 * Otherwise `top` ranges over [scrollMin, scrollMax] and the thumb maps 0..1 onto that range,
 * so the viewport can never travel past the artwork.
 */
export function computeAxis({ min, max, scroll, viewportPx, zoom }) {
  const z = Math.max(0.01, num(zoom) || 1);
  const viewport = Math.max(1, num(viewportPx));
  const top = -num(scroll);
  if (min == null || max == null || !(max > min)) return { enabled: false, reason: "empty", top };
  const contentPx = (max - min) * z;
  if (contentPx <= viewport + FIT_EPSILON_PX) return { enabled: false, reason: "fits", top, contentPx };
  const viewportWorld = viewport / z;
  const scrollMin = min;
  const scrollMax = max - viewportWorld;
  const progress = scrollMax > scrollMin ? Math.max(0, Math.min(1, (top - scrollMin) / (scrollMax - scrollMin))) : 0;
  return {
    enabled: true,
    top,
    scrollMin,
    scrollMax,
    progress,
    thumbRatio: Math.max(0, Math.min(1, viewport / contentPx)),
    viewportWorld,
    contentPx,
  };
}

export const clampScroll = (axis, value) => (axis?.enabled ? Math.max(axis.scrollMin, Math.min(axis.scrollMax, value)) : value);

/** Pixel size of the thumb for a track of `trackPx`. */
export const thumbLength = (axis, trackPx) => Math.min(trackPx, Math.max(MIN_THUMB_PX, trackPx * (axis?.thumbRatio ?? 1)));

/** Camera position (world units) for a thumb progress 0..1. */
export const scrollForProgress = (axis, progress) => axis.scrollMin + Math.max(0, Math.min(1, progress)) * (axis.scrollMax - axis.scrollMin);

/** Both axes from the scene + camera. */
export function computeScrollState({ elements, appState = {}, width, height }) {
  const bounds = computeContentBounds(elements);
  const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
  return {
    bounds,
    vertical: computeAxis({ min: bounds?.minY, max: bounds?.maxY, scroll: appState.scrollY, viewportPx: height, zoom }),
    horizontal: computeAxis({ min: bounds?.minX, max: bounds?.maxX, scroll: appState.scrollX, viewportPx: width, zoom }),
  };
}
