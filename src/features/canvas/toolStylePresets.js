import { strokeWidthAppStatePatch } from "./strokeWidthKey.js";

/**
 * Per-canvas, per-tool style memory.
 *
 * Excalidraw keeps ONE global set of `currentItem*` defaults, so changing the
 * colour of a rectangle also changes what the next line looks like. Sketchizi
 * instead remembers the last style chosen for each drawing tool, separately on
 * every canvas tab, and re-applies it whenever that tool is activated again.
 *
 * This module is deliberately free of React / Excalidraw imports so the rules
 * can be unit-tested in plain Node.
 */

export const PRESET_TOOL_KEYS = Object.freeze([
  "rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text",
]);

const TOOL_ALIASES = Object.freeze({ draw: "freedraw", pen: "freedraw" });

const INK = "#1e1e1e";

/**
 * Fallback styles used the first time a tool is activated on a canvas.
 *
 * Notes:
 *  - `roughness` is a placeholder; the canvas appearance (Architect/Artist/
 *    Cartoonist) supplies the real fallback, see `resolveToolStylePreset`.
 *  - `fontFamily` is intentionally absent for text: the canvas-wide font
 *    preference is owned by useExcalidrawScene and persisted with the sketch.
 *  - Tools that cannot be filled (line/arrow/freedraw) reset the background to
 *    transparent so a blue rectangle fill never leaks into the next line.
 */
export const DEFAULT_TOOL_STYLE_PRESETS = deepFreeze({
  line: {
    strokeColor: INK,
    backgroundColor: "transparent",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    startArrowhead: null,
    endArrowhead: null,
    lineGeometry: "straight",
  },
  arrow: {
    strokeColor: INK,
    backgroundColor: "transparent",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    startArrowhead: null,
    endArrowhead: "arrow",
    lineGeometry: "straight",
  },
  rectangle: {
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    roundness: { type: 3 },
    opacity: 100,
  },
  diamond: {
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    roundness: { type: 3 },
    opacity: 100,
  },
  ellipse: {
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
  },
  freedraw: {
    strokeColor: INK,
    backgroundColor: "transparent",
    strokeWidth: 2,
    opacity: 100,
    pressure: true,
  },
  text: {
    strokeColor: INK,
    opacity: 100,
    fontSize: 20,
    textAlign: "left",
  },
});

const SHAPE_KEYS = ["strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity"];
const LINEAR_KEYS = [
  "strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "roundness",
  "opacity", "startArrowhead", "endArrowhead", "lineGeometry",
];

/** Which style properties each tool is allowed to remember. */
export const TOOL_STYLE_KEYS = Object.freeze({
  rectangle: Object.freeze([...SHAPE_KEYS, "roundness"]),
  diamond: Object.freeze([...SHAPE_KEYS, "roundness"]),
  ellipse: Object.freeze([...SHAPE_KEYS]),
  line: Object.freeze([...LINEAR_KEYS]),
  arrow: Object.freeze([...LINEAR_KEYS]),
  freedraw: Object.freeze(["strokeColor", "backgroundColor", "strokeWidth", "opacity", "pressure"]),
  text: Object.freeze(["strokeColor", "opacity", "fontFamily", "fontSize", "textAlign"]),
});

const VALID_STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const VALID_FILL_STYLES = new Set(["solid", "hachure", "cross-hatch", "zigzag"]);
const VALID_TEXT_ALIGN = new Set(["left", "center", "right"]);
const VALID_ARROWHEADS = new Set([
  "arrow", "bar", "dot", "circle", "circle_outline", "triangle", "triangle_outline",
  "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many",
]);
const VALID_LINE_GEOMETRY = new Set(["straight", "curved", "elbow", "rounded-elbow"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Normalizes an Excalidraw tool/element type to a preset key, or null. */
export function normalizeToolKey(type) {
  const raw = String(type || "").trim().toLowerCase();
  const key = TOOL_ALIASES[raw] || raw;
  return PRESET_TOOL_KEYS.includes(key) ? key : null;
}

/** Excalidraw element `roundness` ({type}|null) from either element or appState form. */
export function normalizeRoundness(value) {
  if (value === null) return null;
  if (value === "sharp") return null;
  if (value === "round") return { type: 3 };
  if (isPlainObject(value) && Number.isFinite(Number(value.type))) return { type: Number(value.type) };
  return undefined;
}

/** Validates one style value. Returns `undefined` when the value is unusable. */
export function normalizeStyleValue(key, value) {
  switch (key) {
    case "strokeColor":
    case "backgroundColor":
      return typeof value === "string" && value.trim() && value.length <= 64 ? value.trim() : undefined;
    case "strokeWidth": {
      const width = Number(value);
      return Number.isFinite(width) && width > 0 && width <= 64 ? width : undefined;
    }
    case "strokeStyle":
      return VALID_STROKE_STYLES.has(value) ? value : undefined;
    case "fillStyle":
      return VALID_FILL_STYLES.has(value) ? value : undefined;
    case "roughness": {
      const roughness = Number(value);
      return Number.isFinite(roughness) && roughness >= 0 && roughness <= 2 ? roughness : undefined;
    }
    case "opacity": {
      const opacity = Number(value);
      return Number.isFinite(opacity) ? Math.max(0, Math.min(100, opacity)) : undefined;
    }
    case "roundness":
      return normalizeRoundness(value);
    case "startArrowhead":
    case "endArrowhead":
      if (value === null || value === "none") return null;
      return VALID_ARROWHEADS.has(value) ? value : undefined;
    case "fontFamily": {
      const family = Number(value);
      return Number.isInteger(family) && family > 0 && family < 100 ? family : undefined;
    }
    case "fontSize": {
      const size = Number(value);
      return Number.isFinite(size) && size >= 1 && size <= 400 ? size : undefined;
    }
    case "textAlign":
      return VALID_TEXT_ALIGN.has(value) ? value : undefined;
    case "pressure":
      return typeof value === "boolean" ? value : undefined;
    case "lineGeometry":
      return VALID_LINE_GEOMETRY.has(value) ? value : undefined;
    default:
      return undefined;
  }
}

/**
 * Keeps only the keys a tool may remember, with validated values.
 * Returns a new object (possibly empty); never mutates `patch`.
 */
export function filterStyleForTool(toolKey, patch) {
  const key = normalizeToolKey(toolKey);
  if (!key || !isPlainObject(patch)) return {};
  const allowed = TOOL_STYLE_KEYS[key];
  const result = {};
  for (const styleKey of allowed) {
    if (!(styleKey in patch)) continue;
    const value = normalizeStyleValue(styleKey, patch[styleKey]);
    if (value !== undefined) result[styleKey] = value;
  }
  return result;
}

/**
 * Translates style properties (element-style names) into Excalidraw's
 * `currentItem*` appState fields. Accepts a superset of the preset keys so the
 * dock and the floating toolbar can share it for non-remembered options such as
 * `verticalAlign`.
 */
export function stylePatchToAppState(patch) {
  const appState = {};
  if (!isPlainObject(patch)) return appState;
  if ("strokeColor" in patch) appState.currentItemStrokeColor = patch.strokeColor;
  if ("backgroundColor" in patch) appState.currentItemBackgroundColor = patch.backgroundColor;
  if ("fillStyle" in patch) appState.currentItemFillStyle = patch.fillStyle;
  // Width needs the paired key or the free-draw engine keeps the old thickness.
  if ("strokeWidth" in patch) Object.assign(appState, strokeWidthAppStatePatch(patch.strokeWidth));
  if ("strokeStyle" in patch) appState.currentItemStrokeStyle = patch.strokeStyle;
  if ("roughness" in patch) appState.currentItemRoughness = patch.roughness;
  if ("opacity" in patch) appState.currentItemOpacity = patch.opacity;
  // appState stores "round" | "sharp"; elements store {type}|null.
  if ("roundness" in patch) {
    const roundness = normalizeRoundness(patch.roundness);
    if (roundness !== undefined) appState.currentItemRoundness = roundness ? "round" : "sharp";
  }
  if ("startArrowhead" in patch) appState.currentItemStartArrowhead = patch.startArrowhead;
  if ("endArrowhead" in patch) appState.currentItemEndArrowhead = patch.endArrowhead;
  if ("fontFamily" in patch) appState.currentItemFontFamily = patch.fontFamily;
  if ("fontSize" in patch) appState.currentItemFontSize = patch.fontSize;
  if ("textAlign" in patch) appState.currentItemTextAlign = patch.textAlign;
  if ("verticalAlign" in patch) appState.currentItemVerticalAlign = patch.verticalAlign;
  if ("pressure" in patch) appState.currentItemPressure = patch.pressure;
  if ("lineGeometry" in patch) appState.currentItemLineGeometry = patch.lineGeometry;
  return appState;
}

/**
 * Preset that will be applied for a tool: defaults, then canvas-wide roughness,
 * then whatever the user last chose for this tool on this canvas.
 */
export function resolveToolStylePreset(toolKey, saved, baseRoughness) {
  const key = normalizeToolKey(toolKey);
  if (!key) return null;
  const preset = { ...DEFAULT_TOOL_STYLE_PRESETS[key] };
  if ("roughness" in preset && Number.isFinite(baseRoughness)) preset.roughness = baseRoughness;
  return { ...preset, ...filterStyleForTool(key, saved) };
}

/** True when every field of `appStatePatch` already holds that value in `appState`. */
export function appStatePatchMatches(appState, appStatePatch) {
  if (!isPlainObject(appState) || !isPlainObject(appStatePatch)) return false;
  return Object.entries(appStatePatch).every(([key, value]) => {
    const live = appState[key];
    if (live === value) return true;
    // Excalidraw can hold `undefined` for a null arrowhead.
    return (live == null && value == null);
  });
}

function sanitizeToolPresets(raw) {
  const presets = {};
  if (!isPlainObject(raw)) return presets;
  for (const toolKey of PRESET_TOOL_KEYS) {
    const clean = filterStyleForTool(toolKey, raw[toolKey]);
    if (Object.keys(clean).length) presets[toolKey] = clean;
  }
  return presets;
}

/** JSON-safe canvas state `{ baseRoughness?, presets }`, or null when empty. */
export function sanitizeCanvasToolStyleState(raw) {
  if (!isPlainObject(raw)) return null;
  const presets = sanitizeToolPresets(raw.presets);
  const baseRoughness = normalizeStyleValue("roughness", raw.baseRoughness);
  if (!Object.keys(presets).length && baseRoughness === undefined) return null;
  return baseRoughness === undefined ? { presets } : { baseRoughness, presets };
}

/**
 * In-memory store keyed by canvas/tab id:
 *   canvasId -> { baseRoughness?: number, presets: { [toolKey]: partial style } }
 */
export function createToolStylePresetStore() {
  const canvases = new Map();

  const ensure = (canvasId) => {
    const id = String(canvasId || "");
    if (!canvases.has(id)) canvases.set(id, { presets: {} });
    return canvases.get(id);
  };

  return {
    has: (canvasId) => canvases.has(String(canvasId || "")),

    /** Saved (partial) preset for a tool, or undefined. */
    get(canvasId, toolKey) {
      const key = normalizeToolKey(toolKey);
      const preset = key ? canvases.get(String(canvasId || ""))?.presets[key] : undefined;
      return preset ? { ...preset } : undefined;
    },

    /** Defaults + canvas roughness + saved preset. */
    resolve(canvasId, toolKey) {
      const key = normalizeToolKey(toolKey);
      if (!key) return null;
      const canvas = canvases.get(String(canvasId || ""));
      return resolveToolStylePreset(key, canvas?.presets[key], canvas?.baseRoughness);
    },

    /**
     * Merge `patch` into the tool's preset. Returns the keys that were actually
     * recorded (after filtering/validation), or null when nothing applied.
     */
    record(canvasId, toolKey, patch) {
      const key = normalizeToolKey(toolKey);
      if (!key) return null;
      const recorded = filterStyleForTool(key, patch);
      if (!Object.keys(recorded).length) return null;
      const canvas = ensure(canvasId);
      canvas.presets[key] = { ...(canvas.presets[key] || {}), ...recorded };
      return recorded;
    },

    getBaseRoughness: (canvasId) => canvases.get(String(canvasId || ""))?.baseRoughness,

    /** Captures the canvas' starting roughness once, without overriding a known value. */
    ensureBaseRoughness(canvasId, roughness) {
      const canvas = ensure(canvasId);
      if (canvas.baseRoughness !== undefined) return;
      const value = normalizeStyleValue("roughness", roughness);
      if (value !== undefined) canvas.baseRoughness = value;
    },

    /**
     * Canvas-wide appearance change (Sketch / Clean / Chalkboard). It restyles the
     * whole canvas, so per-tool roughness choices no longer apply.
     */
    setCanvasRoughness(canvasId, roughness) {
      const value = normalizeStyleValue("roughness", roughness);
      if (value === undefined) return;
      const canvas = ensure(canvasId);
      canvas.baseRoughness = value;
      for (const preset of Object.values(canvas.presets)) delete preset.roughness;
    },

    /** JSON-safe copy for tab snapshots, or null when there is nothing to keep. */
    export(canvasId) {
      return sanitizeCanvasToolStyleState(canvases.get(String(canvasId || "")));
    },

    /** Merge persisted state; values already chosen this session win. */
    hydrate(canvasId, raw) {
      const clean = sanitizeCanvasToolStyleState(raw);
      if (!clean) return false;
      const canvas = ensure(canvasId);
      if (clean.baseRoughness !== undefined) canvas.baseRoughness = clean.baseRoughness;
      for (const [toolKey, preset] of Object.entries(clean.presets)) {
        canvas.presets[toolKey] = { ...preset, ...(canvas.presets[toolKey] || {}) };
      }
      return true;
    },

    remove: (canvasId) => canvases.delete(String(canvasId || "")),
  };
}
