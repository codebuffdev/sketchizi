export const CANVAS_BACKGROUND_PATTERN_KEY = "sketchizi-canvas-background-pattern";
export const CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY = "sketchizi-canvas-background-explicit-color";

export const CANVAS_BACKGROUND_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Soft gray", value: "#f3f4f6" },
  { name: "Black", value: "#101114" },
  { name: "Slate", value: "#2b3445" },
  { name: "Warm cream", value: "#fff0d6" },
  { name: "Pink", value: "#f9cfe3" },
  { name: "Blue", value: "#bcd4ff" },
  { name: "Mint", value: "#baf2dc" },
  { name: "Lavender", value: "#d9caff" },
  { name: "Peach", value: "#ffcbb8" },
  { name: "Butter yellow", value: "#fff0a8" },
  { name: "Aqua", value: "#a8eff5" },
  { name: "Rose", value: "#f7b9c7" },
  { name: "Pistachio", value: "#d4f0bd" },
  { name: "Lilac", value: "#cdb5ff" },
  { name: "Pale green", value: "#d5f5e7" },
];

export const CANVAS_BACKGROUND_PATTERNS = [
  { id: "solid", name: "Solid" },
  { id: "grid", name: "Grid" },
  { id: "dot-grid", name: "Dot grid" },
  { id: "graph-paper", name: "Graph paper" },
  { id: "horizontal", name: "Horizontal lines" },
  { id: "vertical", name: "Vertical lines" },
  { id: "diagonal", name: "Diagonal lines" },
  { id: "crosshatch", name: "Crosshatch" },
  { id: "isometric", name: "Isometric" },
];

export function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().startsWith("#") ? value.trim() : `#${value.trim()}`;
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.slice(1).split("").map((part) => part + part).join("")}`.toLowerCase();
  }
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : null;
}
