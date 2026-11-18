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
  if (appearance === "sketch") return canvasColorForScene(APPEARANCE_COLORS.sketch, isDarkTheme);
  if (appearance === "chalkboard") return canvasColorForScene(APPEARANCE_COLORS.chalkboard, true);
  return getCanvasBackground(isDarkTheme);
}

export function getCanvasAppearanceFromBackground(background) {
  const normalized = String(background || "").trim().toLowerCase();
  if (normalized === getCanvasAppearanceBackground("chalkboard", false)) return "chalkboard";
  if ([false, true].some((isDark) => normalized === getCanvasAppearanceBackground("sketch", isDark))) return "sketch";
  // Drawing roughness belongs to the separate Architect / Artist /
  // Cartoonist environment setting, not to the canvas surface appearance.
  return "clean";
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
  const nextBackground = String(background || "").trim().toLowerCase();
  if (currentBackground === nextBackground) return false;

  // Canvas appearance controls only the surface. Drawing roughness is managed
  // independently by the selected drawing environment.
  api.updateScene({ appState: { viewBackgroundColor: background }, captureUpdate });
  return true;
}
