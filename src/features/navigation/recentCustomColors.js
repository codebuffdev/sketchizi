export const RECENT_CUSTOM_COLORS_KEY = "sketchizi.recentCustomColors";
export const MAX_RECENT_CUSTOM_COLORS = 2;
export const RECENT_CUSTOM_COLORS_EVENT = "sketchizi:recent-custom-colors";
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value) => HEX_RE.test(String(value || ""));

export function normalizeRecentCustomColors(value, max = MAX_RECENT_CUSTOM_COLORS) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    if (!isHexColor(entry)) continue;
    const color = String(entry).toLowerCase();
    if (seen.has(color)) continue;
    seen.add(color);
    out.push(color);
    if (out.length >= max) break;
  }
  return out;
}

export function readRecentCustomColors() {
  try {
    return normalizeRecentCustomColors(JSON.parse(localStorage.getItem(RECENT_CUSTOM_COLORS_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function writeRecentCustomColors(colors) {
  try { localStorage.setItem(RECENT_CUSTOM_COLORS_KEY, JSON.stringify(colors)); } catch {}
}

/**
 * Pure reducer. Prepends `color` (deduplicated, capped). Presets are never
 * stored. With `replaceHead`, the newest entry is swapped instead of pushed:
 * the native picker fires `input` continuously while dragging, and this stops
 * intermediate shades from evicting older saved colors.
 */
export function addRecentCustomColor(current, color, { presets = [], replaceHead = false, max = MAX_RECENT_CUSTOM_COLORS } = {}) {
  if (!isHexColor(color)) return current;
  const next = String(color).toLowerCase();
  if (presets.some((preset) => String(preset).toLowerCase() === next)) return current;
  const base = replaceHead ? current.slice(1) : current;
  return normalizeRecentCustomColors([next, ...base.filter((entry) => entry !== next)], max);
}
