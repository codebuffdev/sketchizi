const VALID_STROKE_WIDTH_KEYS = new Set(["thin", "medium", "bold"]);
const LEGACY_WIDTH_TO_KEY = new Map([[1, "thin"], [2, "medium"], [4, "bold"]]);

/** Resolve current and legacy appState width formats used by Sketchizi's dock. */
export function getFreeDrawStrokeWidthKey(appState = {}) {
  const key = appState?.currentItemStrokeWidthKey;
  if (VALID_STROKE_WIDTH_KEYS.has(key)) return key;
  return LEGACY_WIDTH_TO_KEY.get(Number(appState?.currentItemStrokeWidth)) || "medium";
}
