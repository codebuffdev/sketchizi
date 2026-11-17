import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { canvasColorForScene } from "./canvasColors.js";
import { getCanvasBackground } from "./canvasTheme.js";

export const CANVAS_APPEARANCES = Object.freeze(["sketch", "clean", "chalkboard"]);

const APPEARANCE_COLORS = Object.freeze({
  sketch: "#f7f2e8",
  chalkboard: "#1b382f",
});

const ROUGHNESS_CAPABLE_TYPES = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
]);

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

function applyRoughnessToExistingElements(api, roughness) {
  const getElements = api.getSceneElementsIncludingDeleted || api.getSceneElements;
  if (typeof getElements !== "function") return null;

  const elements = getElements.call(api);
  if (!Array.isArray(elements)) return null;

  let changed = false;
  const nextElements = elements.map((element) => {
    if (!element || element.isDeleted || !ROUGHNESS_CAPABLE_TYPES.has(element.type) ||
      element.roughness === roughness) return element;

    changed = true;
    return {
      ...element,
      roughness,
      version: (Number(element.version) || 0) + 1,
      versionNonce: (Number(element.versionNonce) || 0) + 1,
    };
  });

  return changed ? nextElements : null;
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

  // Sketch changes drawing style across the whole canvas, not its surface.
  // Only replace the warm-paper background left by the earlier implementation.
  if (appearance === "chalkboard" || appearance === "clean" || isLegacySketchBackground) {
    nextAppState.viewBackgroundColor = appearance === "sketch"
      ? getCanvasBackground(isDarkTheme)
      : background;
  }

  const nextElements = applyRoughnessToExistingElements(api, roughness);
  const backgroundUnchanged = nextAppState.viewBackgroundColor === undefined ||
    String(nextAppState.viewBackgroundColor).trim().toLowerCase() === currentBackground;
  const appStateUnchanged = backgroundUnchanged && appState.currentItemRoughness === roughness;
  if (appStateUnchanged && !nextElements) return false;

  api.updateScene({
    ...(nextElements ? { elements: nextElements } : {}),
    appState: nextAppState,
    captureUpdate,
  });
  return true;
}
