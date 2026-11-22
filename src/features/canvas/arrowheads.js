// Single source of truth for arrowhead values used by the dock, the contextual
// toolbar and the properties panel.
//
// The UI offers a "Dot" arrowhead. Excalidraw's renderer draws the filled
// circular head for "circle"; an unrecognised value such as a bare "dot" falls
// through to the default V-chevron "arrow" branch (the reported bug). So the
// UI keeps talking about "dot", and every write to an element / appState goes
// through toCanvasArrowhead(), which emits the value the renderer understands.
// Reads go through toUiArrowhead(), which folds the legacy "dot" and the
// canonical "circle" back into the single "dot" menu entry.

export const DOT_UI_VALUE = "dot";
export const DOT_CANVAS_VALUE = "circle";

/** UI value -> value stored on elements / appState (null = no arrowhead). */
export function toCanvasArrowhead(value) {
  if (value === null || value === undefined || value === "" || value === "none") return null;
  if (value === DOT_UI_VALUE || value === "filled-dot") return DOT_CANVAS_VALUE;
  return value;
}

/** Stored value -> value shown in the <select> / popover ("none" when empty). */
export function toUiArrowhead(value) {
  if (value === null || value === undefined || value === "" || value === "none") return "none";
  if (value === DOT_CANVAS_VALUE || value === DOT_UI_VALUE) return DOT_UI_VALUE;
  return value;
}

/** Normalizes the arrowhead keys of a style patch; other keys are untouched. */
export function normalizeArrowheadPatch(patch) {
  if (!patch || typeof patch !== "object") return patch;
  if (!("startArrowhead" in patch) && !("endArrowhead" in patch)) return patch;
  const next = { ...patch };
  if ("startArrowhead" in next) next.startArrowhead = toCanvasArrowhead(next.startArrowhead);
  if ("endArrowhead" in next) next.endArrowhead = toCanvasArrowhead(next.endArrowhead);
  return next;
}

/** Patch that swaps the two ends of an arrow-like element or appState pair. */
export function swapArrowheadsPatch(start, end) {
  return { startArrowhead: toCanvasArrowhead(end), endArrowhead: toCanvasArrowhead(start) };
}
