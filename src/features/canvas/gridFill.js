/**
 * Orthogonal "grid" fill style.
 *
 * Excalidraw's renderer (roughjs, bundled in the package) only knows solid /
 * hachure / cross-hatch / zigzag, so a literal `fillStyle: "grid"` would be
 * drawn as hachure. A grid-filled shape is therefore stored as a transparent
 * "solid" element carrying `customData.gridFill = { color, gap, weight }`,
 * and GridFillLayer paints the lines. `getFillStyle()` reports "grid" for the
 * UI. Pure canvas/geometry code, no DOM, so it is unit-testable.
 */
export const GRID_GAP_MIN = 12;
export const GRID_GAP_MAX = 48;
export const GRID_GAP_DEFAULT = 24;
export const GRID_WEIGHT_MIN = 1;
export const GRID_WEIGHT_MAX = 3;
export const GRID_WEIGHT_DEFAULT = 1.5;
export const GRID_SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isTransparent = (c) => !c || c === "transparent";

export function getGridFill(element) {
  const g = element?.customData?.gridFill;
  if (!g || !GRID_SHAPE_TYPES.has(element.type)) return null;
  return {
    color: g.color || element.strokeColor || "#1e1e1e",
    gap: clamp(Number(g.gap) || GRID_GAP_DEFAULT, GRID_GAP_MIN, GRID_GAP_MAX),
    weight: clamp(Number(g.weight) || GRID_WEIGHT_DEFAULT, GRID_WEIGHT_MIN, GRID_WEIGHT_MAX),
  };
}

/** 'solid' | 'hachure' | 'cross-hatch' | 'grid' (| other native values). */
export const getFillStyle = (element) => (getGridFill(element) ? "grid" : element?.fillStyle);

/**
 * Apply a style patch to an element with grid awareness. Replaces the plain
 * `{ ...element, ...patch }` merge used by the format toolbars:
 *  - fillStyle "grid" moves the fill color into customData.gridFill;
 *  - a fill color change on a grid shape recolors the grid;
 *  - any other fillStyle (or transparent fill) restores a normal fill;
 *  - gridGap / gridWeight only change the grid and never touch hachure or
 *    cross-hatch fills.
 */
export function applyStylePatch(element, patch) {
  const { gridGap, gridWeight, ...rest } = patch;
  const grid = getGridFill(element);
  const next = { ...element, ...rest };
  const withGrid = (g) => { next.customData = { ...(element.customData || {}), gridFill: g }; };
  const dropGrid = () => {
    const { gridFill, ...others } = element.customData || {};
    next.customData = Object.keys(others).length ? others : undefined;
  };

  if (rest.fillStyle === "grid") {
    if (!GRID_SHAPE_TYPES.has(element.type)) { next.fillStyle = element.fillStyle; return next; }
    const color = rest.backgroundColor && !isTransparent(rest.backgroundColor) ? rest.backgroundColor
      : grid?.color || (isTransparent(element.backgroundColor) ? element.strokeColor : element.backgroundColor) || "#1e1e1e";
    next.fillStyle = "solid";
    next.backgroundColor = "transparent";
    withGrid({ color, gap: grid?.gap ?? GRID_GAP_DEFAULT, weight: grid?.weight ?? GRID_WEIGHT_DEFAULT });
  } else if (grid) {
    if ("fillStyle" in rest || ("backgroundColor" in rest && isTransparent(rest.backgroundColor))) {
      next.backgroundColor = "backgroundColor" in rest ? rest.backgroundColor : grid.color;
      dropGrid();
    } else if ("backgroundColor" in rest) {
      next.backgroundColor = "transparent";
      withGrid({ ...grid, color: rest.backgroundColor });
    }
  }
  const live = getGridFill(next);
  if (live && (gridGap != null || gridWeight != null)) {
    withGrid({
      color: live.color,
      gap: clamp(Number(gridGap) || live.gap, GRID_GAP_MIN, GRID_GAP_MAX),
      weight: clamp(Number(gridWeight) || live.weight, GRID_WEIGHT_MIN, GRID_WEIGHT_MAX),
    });
  }
  return next;
}

/** Style keys that must not leak into remembered tool presets. */
export function stripGridKeys(patch) {
  const { gridGap, gridWeight, ...rest } = patch;
  if (rest.fillStyle === "grid") delete rest.fillStyle;
  return rest;
}

/** Deterministic PRNG so hand-drawn jitter is stable across repaints. */
export function seededRandom(seed) {
  let s = (Number(seed) || 1) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Interior path in the element's local (unrotated) scene coordinates. */
export function buildShapePath(element) {
  const { x, y, width: w, height: h } = element;
  const p = new Path2D();
  if (element.type === "ellipse") {
    p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  } else if (element.type === "diamond") {
    p.moveTo(x + w / 2, y); p.lineTo(x + w, y + h / 2); p.lineTo(x + w / 2, y + h); p.lineTo(x, y + h / 2); p.closePath();
  } else {
    const r = element.roundness
      ? Math.min(element.roundness.type === 3 ? 32 : Infinity, 0.25 * Math.min(w, h)) : 0;
    if (r > 0 && p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h);
  }
  return p;
}

/** Line segments for the grid: horizontals y+gap..y+h, verticals x+gap..x+w. */
export function gridLines(element, { gap, roughness = 0, seed = 1 }) {
  const { x, y, width: w, height: h } = element;
  const rand = seededRandom(seed);
  const amp = Math.min(2.5, Math.max(0, roughness) * 0.9);
  const jit = () => (amp ? (rand() - 0.5) * 2 * amp : 0);
  const lines = [];
  for (let yy = y + gap; yy <= y + h; yy += gap) {
    lines.push({ x1: x + jit(), y1: yy + jit(), x2: x + w + jit(), y2: yy + jit(), bow: jit() });
  }
  for (let xx = x + gap; xx <= x + w; xx += gap) {
    lines.push({ x1: xx + jit(), y1: y + jit(), x2: xx + jit(), y2: y + h + jit(), bow: jit() });
  }
  return lines;
}

/**
 * Draw a grid fill: clip to the shape interior, stroke the grid, restore.
 * roughness 0 gives crisp architectural lines; > 0 adds subtle seeded jitter.
 */
export function drawGridFill(ctx, element) {
  const grid = getGridFill(element);
  if (!grid) return;
  const lines = gridLines(element, { gap: grid.gap, roughness: element.roughness, seed: element.seed });
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  ctx.save();
  if (element.angle) { ctx.translate(cx, cy); ctx.rotate(element.angle); ctx.translate(-cx, -cy); }
  ctx.clip(buildShapePath(element));
  ctx.globalAlpha = (Number(element.opacity) || 100) / 100;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = grid.weight;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const l of lines) {
    ctx.moveTo(l.x1, l.y1);
    if (element.roughness > 0 && l.bow) ctx.quadraticCurveTo((l.x1 + l.x2) / 2 + l.bow, (l.y1 + l.y2) / 2 + l.bow, l.x2, l.y2);
    else ctx.lineTo(l.x2, l.y2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Later (higher z) text and opaque shapes must stay on top of the grid. */
export function occludesGrid(element) {
  if (!element || element.isDeleted) return false;
  if (element.type === "text") return true;
  return GRID_SHAPE_TYPES.has(element.type) && !getGridFill(element) &&
    element.fillStyle === "solid" && !isTransparent(element.backgroundColor) && (Number(element.opacity) || 100) >= 100;
}

/** Paint every grid-filled shape in z order, knocking out what sits above it. */
export function paintGridFills(ctx, elements) {
  elements.forEach((element, index) => {
    if (element.isDeleted || !getGridFill(element)) return;
    drawGridFill(ctx, element);
    for (let i = index + 1; i < elements.length; i += 1) {
      const above = elements[i];
      if (!occludesGrid(above)) continue;
      const pad = above.type === "text" ? 2 : 0;
      const cx = above.x + above.width / 2;
      const cy = above.y + above.height / 2;
      ctx.save();
      if (above.angle) { ctx.translate(cx, cy); ctx.rotate(above.angle); ctx.translate(-cx, -cy); }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill(above.type === "text"
        ? (() => { const r = new Path2D(); r.rect(above.x - pad, above.y - pad, above.width + 2 * pad, above.height + 2 * pad); return r; })()
        : buildShapePath(above));
      ctx.restore();
    }
  });
}
