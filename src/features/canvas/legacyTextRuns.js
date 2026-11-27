// Backward compatibility only. Per-run text colors (element.customData.runs) were
// removed: every text element is a single color (strokeColor) again. Diagrams saved
// while the feature existed may still carry `runs`; on load they are flattened to
// plain text and the per-run colors are ignored.

const hasRuns = (element) =>
  element?.type === "text" && Array.isArray(element.customData?.runs);

export function stripLegacyTextRun(element) {
  if (!hasRuns(element)) return element;
  const { runs, ...otherData } = element.customData;
  const joined = runs.map((run) => (typeof run?.text === "string" ? run.text : "")).join("");
  const next = { ...element, customData: Object.keys(otherData).length ? otherData : undefined };
  // Runs index originalText. If they no longer line up with it they are stale: keep the real text.
  if (joined && joined !== element.originalText && typeof element.originalText !== "string") {
    next.originalText = joined;
    if (!element.containerId) next.text = joined;
  }
  return next;
}

// -> { elements, changed }. Returns the same array when nothing needs cleaning.
export function stripLegacyTextRuns(elements) {
  if (!Array.isArray(elements) || !elements.some(hasRuns)) return { elements, changed: false };
  return { elements: elements.map(stripLegacyTextRun), changed: true };
}
