import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export const LIGHT_CANVAS_BACKGROUND = "#ffffff";
export const DARK_CANVAS_BACKGROUND = "#111722";

/**
 * Reconcile Excalidraw's actual scene background with Sketchizi's single
 * Day/Night theme. Read from the live API, never from a stale onChange payload.
 */
export function applyCanvasThemeBackground(api, isDarkTheme) {
  if (!api?.getAppState || !api?.updateScene) return false;

  const desiredBackground = isDarkTheme
    ? DARK_CANVAS_BACKGROUND
    : LIGHT_CANVAS_BACKGROUND;
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
