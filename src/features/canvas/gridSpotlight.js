// The decorative grid spotlight uses CSS pixels, not physical centimeters.
// CSS defines 1in = 96px; actual physical size varies by display calibration.
export const GRID_SPOTLIGHT_RADIUS_CM = 13;
export const CSS_PIXELS_PER_CM = 96 / 2.54;
export const GRID_SPOTLIGHT_VIEWPORT_FRACTION = 0.42;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function spotlightRadius(width, height, radiusCm = GRID_SPOTLIGHT_RADIUS_CM) {
  const w = Math.max(0, finite(width));
  const h = Math.max(0, finite(height));
  if (!w || !h) return 0;
  const preferred = clamp(finite(radiusCm, GRID_SPOTLIGHT_RADIUS_CM), 12, 14) * CSS_PIXELS_PER_CM;
  return Math.round(Math.min(preferred, w * GRID_SPOTLIGHT_VIEWPORT_FRACTION, h * GRID_SPOTLIGHT_VIEWPORT_FRACTION));
}

export function spotlightCenter(x, y, width, height) {
  const w = Math.max(0, finite(width));
  const h = Math.max(0, finite(height));
  return {
    x: Math.round(clamp(finite(x, w / 2), 0, w)),
    y: Math.round(clamp(finite(y, h / 2), 0, h)),
  };
}

// Excalidraw stores scene locations in unzoomed coordinates. The current
// scene-to-screen formula is (element + scroll) * zoom, relative to the editor.
export function spotlightElementCenter(element, appState) {
  if (!element || element.isDeleted || element.deleted) return null;
  const zoom = finite(appState?.zoom?.value ?? appState?.zoom, 1);
  if (zoom <= 0) return null;
  const x = finite(element.x) + finite(element.width) / 2;
  const y = finite(element.y) + finite(element.height) / 2;
  return {
    x: (x + finite(appState?.scrollX)) * zoom,
    y: (y + finite(appState?.scrollY)) * zoom,
  };
}

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

/** Match the scene's pan and zoom so the dot pattern does not slide on camera movement. */
export function spotlightGridPattern(appState) {
  const zoom = Math.max(0.01, finite(appState?.zoom?.value ?? appState?.zoom, 1));
  const size = clamp(finite(appState?.gridSize, 20), 5, 100);
  const spacing = clamp(size * zoom, 8, 72);
  return {
    spacing,
    offsetX: positiveModulo(finite(appState?.scrollX) * zoom, spacing),
    offsetY: positiveModulo(finite(appState?.scrollY) * zoom, spacing),
  };
}
