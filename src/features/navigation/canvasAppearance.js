import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { canvasColorForScene } from "./canvasColors.js";
import { getCanvasBackground } from "./canvasTheme.js";

export const CANVAS_APPEARANCES = Object.freeze(["sketch", "clean", "chalkboard"]);

const APPEARANCE_COLORS = Object.freeze({
  sketch: "#f7f2e8",
  chalkboard: "#1b382f",
});

export function getCanvasAppearanceTheme(appearance, isDarkTheme) {
  return appearance === "chalkboard" || Boolean(isDarkTheme) ? "dark" : "light";
}

export function getCanvasAppearanceRoughness(appearance) {
  if (appearance === "sketch" || appearance === "chalkboard") return 2;
  return 0;
}

export function getCanvasAppearanceBackground(appearance, isDarkTheme) {
  if (appearance === "clean") return getCanvasBackground(isDarkTheme);
  if (appearance === "chalkboard") return canvasColorForScene(APPEARANCE_COLORS.chalkboard, true);
  if (appearance === "sketch") return getCanvasBackground(isDarkTheme);
  return getCanvasBackground(isDarkTheme);
}

export function getCanvasAppearanceFromBackground(background, currentItemRoughness = 0) {
  const normalized = String(background || "").trim().toLowerCase();
  if (normalized === getCanvasAppearanceBackground("chalkboard", false)) return "chalkboard";
  return Number(currentItemRoughness) >= 2 ? "sketch" : "clean";
}

export function applyCanvasAppearance(
  api,
  appearance,
  isDarkTheme,
  captureUpdate = CaptureUpdateAction.IMMEDIATELY,
) {
  if (!api?.getAppState || !api?.updateScene || !CANVAS_APPEARANCES.includes(appearance)) return false;
  const background = getCanvasAppearanceBackground(appearance, isDarkTheme);
  const roughness = getCanvasAppearanceRoughness(appearance);
  const appState = api.getAppState() || {};
  const currentBackground = String(appState.viewBackgroundColor || "").trim().toLowerCase();
  const isLegacySketchBackground = [
    canvasColorForScene(APPEARANCE_COLORS.sketch, false),
    canvasColorForScene(APPEARANCE_COLORS.sketch, true),
  ].some((color) => String(color).trim().toLowerCase() === currentBackground);
  const nextAppState = { currentItemRoughness: roughness };

  // Sketch is a drawing style, not a surface/theme. Only replace the warm-paper
  // background left behind by the earlier implementation; preserve all other
  // user-selected canvas backgrounds.
  if (appearance === "chalkboard" || appearance === "clean" || isLegacySketchBackground) {
    nextAppState.viewBackgroundColor = appearance === "sketch"
      ? getCanvasBackground(isDarkTheme)
      : background;
  }
  const backgroundUnchanged = nextAppState.viewBackgroundColor === undefined ||
    String(nextAppState.viewBackgroundColor).trim().toLowerCase() === currentBackground;
  if (backgroundUnchanged && appState.currentItemRoughness === roughness) return false;
  api.updateScene({ appState: nextAppState, captureUpdate });
  return true;
}
