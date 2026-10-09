export const CANVAS_BACKGROUND_MODE_KEY = "sketchizi-canvas-background-mode";

export function resolveCanvasBackgroundMode(storedMode, hasSavedSketch) {
  if (storedMode === "theme" || storedMode === "custom") return storedMode;
  // Before this setting existed, saved scenes could contain intentional colors.
  // Preserve those scenes unless the user explicitly opts into theme default.
  return hasSavedSketch ? "custom" : "theme";
}
