const VALID_STROKE_WIDTH_KEYS = new Set(["thin", "medium", "bold"]);
const LEGACY_WIDTH_TO_KEY = new Map([[1, "thin"], [2, "medium"], [4, "bold"]]);

/** Resolve current and legacy appState width formats used by Sketchizi's dock. */
export function getFreeDrawStrokeWidthKey(appState = {}) {
  // Sketchizi's dock writes the legacy numeric field. Prefer it when present,
  // otherwise use the current Excalidraw width key.
  const legacyKey = LEGACY_WIDTH_TO_KEY.get(Number(appState?.currentItemStrokeWidth));
  if (legacyKey) return legacyKey;
  const key = appState?.currentItemStrokeWidthKey;
  return VALID_STROKE_WIDTH_KEYS.has(key) ? key : "medium";
}
