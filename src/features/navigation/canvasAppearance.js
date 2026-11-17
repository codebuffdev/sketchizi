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
  if (appearance === "sketch") return canvasColorForScene(APPEARANCE_COLORS.sketch, isDarkTheme);
  return getCanvasBackground(isDarkTheme);
}

export function getCanvasAppearanceFromBackground(background) {
  const normalized = String(background || "").trim().toLowerCase();
  if (!normalized) return "clean";
  if (normalized === getCanvasAppearanceBackground("chalkboard", false)) return "chalkboard";
  if (
    normalized === getCanvasAppearanceBackground("sketch", false) ||
    normalized === getCanvasAppearanceBackground("sketch", true)
  ) return "sketch";
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
  const roughness = getCanvasAppearanceRoughness(appearance);
  const appState = api.getAppState() || {};
  const currentBackground = String(appState.viewBackgroundColor || "").trim().toLowerCase();
  if (currentBackground === background && appState.currentItemRoughness === roughness) return false;
  api.updateScene({
    appState: {
      viewBackgroundColor: background,
      currentItemRoughness: roughness,
    },
    captureUpdate,
  });
  return true;
}
