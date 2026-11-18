import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { canvasColorForScene } from "./canvasColors.js";
import { getCanvasBackground } from "./canvasTheme.js";

export const CANVAS_APPEARANCES = Object.freeze(["sketch", "clean", "chalkboard"]);
export const CANVAS_DRAWING_STYLES = Object.freeze(["architect", "artist", "cartoonist"]);

const DRAWING_STYLE_ROUGHNESS = Object.freeze({ architect: 0, artist: 1, cartoonist: 2 });

export function getCanvasDrawingStyleRoughness(style) {
  return DRAWING_STYLE_ROUGHNESS[style] ?? DRAWING_STYLE_ROUGHNESS.artist;
}

export function getCanvasDrawingStyleFromRoughness(roughness) {
  const value = Number(roughness);
  return CANVAS_DRAWING_STYLES.find((style) => DRAWING_STYLE_ROUGHNESS[style] === value) || "artist";
}

export function applyCanvasDrawingStyle(api, style, captureUpdate = CaptureUpdateAction.IMMEDIATELY) {
  if (!api?.getAppState || !api?.updateScene || !CANVAS_DRAWING_STYLES.includes(style)) return false;
  const roughness = getCanvasDrawingStyleRoughness(style);
  if (api.getAppState()?.currentItemRoughness === roughness) return false;
  api.updateScene({ appState: { currentItemRoughness: roughness }, captureUpdate });
  return true;
}

const APPEARANCE_COLORS = Object.freeze({
  sketch: "#f7f2e8",
  chalkboard: "#1b382f",
});

export function getCanvasAppearanceTheme(appearance, isDarkTheme) {
  return appearance === "chalkboard" || Boolean(isDarkTheme) ? "dark" : "light";
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
  const appState = api.getAppState() || {};
  const currentBackground = String(appState.viewBackgroundColor || "").trim().toLowerCase();
  const isLegacySketchBackground = [
    canvasColorForScene(APPEARANCE_COLORS.sketch, false),
    canvasColorForScene(APPEARANCE_COLORS.sketch, true),
  ].some((color) => String(color).trim().toLowerCase() === currentBackground);
  const nextAppState = {};

  // Sketch changes drawing style across the whole canvas, not its surface.
  // Only replace the warm-paper background left by the earlier implementation.
  if (appearance === "chalkboard" || appearance === "clean" || isLegacySketchBackground) {
    nextAppState.viewBackgroundColor = appearance === "sketch"
      ? getCanvasBackground(isDarkTheme)
      : background;
  }

  const backgroundUnchanged = nextAppState.viewBackgroundColor === undefined ||
    String(nextAppState.viewBackgroundColor).trim().toLowerCase() === currentBackground;
  if (backgroundUnchanged) return false;

  api.updateScene({ appState: nextAppState, captureUpdate });
  return true;
}
