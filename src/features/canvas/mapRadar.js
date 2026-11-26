// Pure helpers behind the bottom-right Map radar. Nothing in here touches the
// DOM or React so the geometry can be unit-tested in plain Node.
//
// Coordinate spaces
//   world  - Excalidraw scene coordinates
//   radar  - CSS pixels inside the radar <canvas>
// Excalidraw maps world -> screen as (x + scrollX) * zoom, so the visible
// world rectangle starts at (-scrollX, -scrollY) and measures
// (canvasWidth / zoom) x (canvasHeight / zoom).

export const MAP_WORLD_PAD = 0.15;
export const RADAR_VIOLET = "#8B5CF6";

const FINITE = Number.isFinite;

export function isDrawable(element) {
  return Boolean(element)
    && !element.isDeleted
    && !element.deleted
    && FINITE(element.x)
    && FINITE(element.y);
}

const LINEAR_TYPES = new Set(["line", "arrow", "freedraw"]);

// Elements are mutated in place by Excalidraw, so cache by (object, version).
const boxCache = new WeakMap();

/**
 * Axis-aligned world box of an element. Linear elements anchor at their first
 * point, which may sit anywhere inside the bounding box, so use the points.
 * Also returns a thinned point list (<= ~32 points) for silhouette drawing.
 */
export function getElementGeometry(element) {
  const version = `${element.version ?? 0}:${element.versionNonce ?? 0}`;
  const cached = boxCache.get(element);
  if (cached && cached.version === version) return cached;

  let box;
  let points = null;
  if (LINEAR_TYPES.has(element.type) && Array.isArray(element.points) && element.points.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of element.points) {
      const px = Number(point?.[0]);
      const py = Number(point?.[1]);
      if (!FINITE(px) || !FINITE(py)) continue;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    if (minX === Infinity) {
      box = { x: element.x, y: element.y, w: 0, h: 0 };
    } else {
      box = { x: element.x + minX, y: element.y + minY, w: maxX - minX, h: maxY - minY };
      const stride = Math.max(1, Math.ceil(element.points.length / 32));
      points = [];
      for (let i = 0; i < element.points.length; i += stride) points.push(element.points[i]);
      const last = element.points[element.points.length - 1];
      if (points[points.length - 1] !== last) points.push(last);
    }
  } else {
    // Excalidraw keeps width/height >= 0, but be defensive about flipped boxes.
    const w = Math.abs(Number(element.width) || 0);
    const h = Math.abs(Number(element.height) || 0);
    box = { x: element.x, y: element.y, w, h };
  }

  const geometry = { version, box, points };
  boxCache.set(element, geometry);
  return geometry;
}

/** Union of every visible element's box, or null when the canvas is empty. */
export function getContentBounds(elements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const element of elements || []) {
    if (!isDrawable(element)) continue;
    const { box } = getElementGeometry(element);
    count += 1;
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }
  return count ? { minX, minY, maxX, maxY, count } : null;
}

/** The camera as a world rectangle: scaled to viewportSize / zoom. */
export function getViewportRect(appState, fallbackSize = { width: 1280, height: 720 }) {
  const zoom = Math.max(0.01, Number(appState?.zoom?.value ?? appState?.zoom) || 1);
  const width = Number(appState?.width) > 0 ? Number(appState.width) : fallbackSize.width;
  const height = Number(appState?.height) > 0 ? Number(appState.height) : fallbackSize.height;
  return {
    x: -(Number(appState?.scrollX) || 0),
    y: -(Number(appState?.scrollY) || 0),
    w: width / zoom,
    h: height / zoom,
    zoom,
  };
}

/**
 * Fit union(content, viewport), padded by 15% on every side, inside a
 * width x height radar (contain, centred). Because the lens can leave the
 * content, the world always includes the viewport.
 */
export function computeRadarTransform({ content, viewport, width, height, pad = MAP_WORLD_PAD }) {
  const minX0 = Math.min(content ? content.minX : viewport.x, viewport.x);
  const minY0 = Math.min(content ? content.minY : viewport.y, viewport.y);
  const maxX0 = Math.max(content ? content.maxX : viewport.x + viewport.w, viewport.x + viewport.w);
  const maxY0 = Math.max(content ? content.maxY : viewport.y + viewport.h, viewport.y + viewport.h);
  const baseW = Math.max(1, maxX0 - minX0);
  const baseH = Math.max(1, maxY0 - minY0);
  const world = {
    minX: minX0 - baseW * pad,
    minY: minY0 - baseH * pad,
    maxX: maxX0 + baseW * pad,
    maxY: maxY0 + baseH * pad,
  };
  const worldW = world.maxX - world.minX;
  const worldH = world.maxY - world.minY;
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const scale = Math.min(safeW / worldW, safeH / worldH);
  return {
    scale,
    ox: (safeW - worldW * scale) / 2,
    oy: (safeH - worldH * scale) / 2,
    world,
    width: safeW,
    height: safeH,
  };
}

export const worldToRadar = (tf, x, y) => ({
  x: tf.ox + (x - tf.world.minX) * tf.scale,
  y: tf.oy + (y - tf.world.minY) * tf.scale,
});

export const radarToWorld = (tf, px, py) => ({
  x: tf.world.minX + (px - tf.ox) / tf.scale,
  y: tf.world.minY + (py - tf.oy) / tf.scale,
});

/** Keep the lens centre inside the (padded) world so it never leaves the radar. */
export function clampCenterToWorld(tf, cx, cy) {
  return {
    x: Math.min(Math.max(cx, tf.world.minX), tf.world.maxX),
    y: Math.min(Math.max(cy, tf.world.minY), tf.world.maxY),
  };
}

/** scrollX/scrollY that put world point (cx, cy) in the middle of the camera. */
export function scrollForCenter(cx, cy, viewW, viewH) {
  return { scrollX: -(cx - viewW / 2), scrollY: -(cy - viewH / 2) };
}

export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

// ---- colour -----------------------------------------------------------------

export function parseColor(input) {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (!value || value === "transparent" || value === "none") return null;
  let match = /^#([0-9a-f]{3,8})$/.exec(value);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if (alpha === 0) return null;
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (match) {
    const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !FINITE(n))) return null;
    if (parts.length >= 4 && parts[3] === 0) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

const luminance = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mix = (c, target, t) => ({
  r: Math.round(c.r + (target.r - c.r) * t),
  g: Math.round(c.g + (target.g - c.g) * t),
  b: Math.round(c.b + (target.b - c.b) * t),
});
const css = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

const DARK_INK = { r: 200, g: 206, b: 220 };
const LIGHT_INK = { r: 120, g: 128, b: 148 };

/**
 * Tint an element's own colour so it stays visible on the radar surface:
 * near-black strokes lift to a soft light grey in Dark Mode, near-white
 * strokes sink to a mid grey in Day Mode. Returns null for "transparent".
 */
export function radarStroke(color, isDark) {
  const parsed = parseColor(color);
  if (!parsed) return css(isDark ? DARK_INK : LIGHT_INK);
  const lum = luminance(parsed);
  if (isDark) {
    if (lum < 0.3) return css(DARK_INK);
    if (lum < 0.5) return css(mix(parsed, { r: 255, g: 255, b: 255 }, 0.45));
    return css(parsed);
  }
  if (lum > 0.88) return css(LIGHT_INK);
  return css(parsed);
}

export function radarFill(color, isDark) {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const lum = luminance(parsed);
  if (isDark && lum > 0.9) return css(DARK_INK);
  if (!isDark && lum > 0.97) return css(mix(parsed, { r: 120, g: 128, b: 148 }, 0.25));
  return css(parsed);
}

// ---- actions ----------------------------------------------------------------

/** Frame all visible content. Same behaviour as the F shortcut. */
export function fitToContent(api) {
  if (!api) return false;
  const elements = api.getSceneElements().filter((element) => !element.isDeleted);
  if (!elements.length) return false;
  if (api.setViewport) api.setViewport({ target: elements, fit: "contain" });
  else api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
  return true;
}
