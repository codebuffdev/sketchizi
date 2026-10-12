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
 * Reconcile Excalidraw's actual scene background with Sketchizi's single
 * Day/Night theme. Read from the live API, never from a stale onChange payload.
 */
export function applyCanvasThemeBackground(api, isDarkTheme) {
  if (!api?.getAppState || !api?.updateScene) return false;

  const desiredBackground = getCanvasBackground(isDarkTheme);
  const actualBackground = String(api.getAppState()?.viewBackgroundColor || "")
    .trim()
    .toLowerCase();

  if (actualBackground === desiredBackground) return false;

  api.updateScene({
    appState: { viewBackgroundColor: desiredBackground },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}
