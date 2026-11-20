import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export const LIGHT_CANVAS_BACKGROUND = "#ffffff";
// Excalidraw renders its dark theme by applying the CSS filter
// `invert(93%) hue-rotate(180deg)` to the canvas, so the stored
// viewBackgroundColor is the *pre-filter* color. Storing the literal dark color
// (#111722) makes the filter turn it into a light blue-grey. This value is the
// pre-image that the filter renders as ~#12181c (visually the dark navy canvas).
export const DARK_CANVAS_BACKGROUND = "#f3faff";

export function getCanvasBackground(isDarkTheme) {
  return isDarkTheme ? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND;
}

/**
 * Update theme defaults while preserving independent drawing backgrounds.
 * Read from the live API, never from a stale onChange payload.
 */
export function applyCanvasThemeBackground(api, isDarkTheme, force = false) {
  if (!api?.getAppState || !api?.updateScene) return false;

  const appState = api.getAppState() || {};
  const desiredBackground = getCanvasBackground(isDarkTheme);
  const desiredTheme = isDarkTheme ? "dark" : "light";
  const actualBackground = String(appState.viewBackgroundColor || "").trim().toLowerCase();
  const nextAppState = {};

  // Preserve user-selected canvas colors; only swap the two theme defaults.
  if (
    (force || !actualBackground || [LIGHT_CANVAS_BACKGROUND, DARK_CANVAS_BACKGROUND].includes(actualBackground)) &&
    actualBackground !== desiredBackground
  ) {
    nextAppState.viewBackgroundColor = desiredBackground;
  }
  if (appState.theme !== desiredTheme) nextAppState.theme = desiredTheme;
  if (!Object.keys(nextAppState).length) return false;

  api.updateScene({
    appState: nextAppState,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}
