// Excalidraw 0.18 keeps two appState fields for the current stroke width: the
// numeric `currentItemStrokeWidth` and the `currentItemStrokeWidthKey`. Only
// restoreAppState derives the key from the number; updateScene is a plain
// setState. The free-draw engine reads the key, so writing only the number
// (as the dock and contextual toolbar did) left the pen on "medium".
const WIDTH_BY_KEY = { thin: 1, medium: 2, bold: 4, extraBold: 8 };

export function getStrokeWidthKeyForWidth(width) {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  let best = "medium";
  let bestDistance = Infinity;
  for (const [key, keyWidth] of Object.entries(WIDTH_BY_KEY)) {
    const distance = Math.abs(keyWidth - value);
    if (distance < bestDistance) { best = key; bestDistance = distance; }
  }
  return best;
}

/** appState patch that keeps the numeric width and its key consistent. */
export function strokeWidthAppStatePatch(width) {
  const key = getStrokeWidthKeyForWidth(width);
  return key ? { currentItemStrokeWidth: width, currentItemStrokeWidthKey: key } : { currentItemStrokeWidth: width };
}
