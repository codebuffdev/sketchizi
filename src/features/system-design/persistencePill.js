// Maps Sketchizi's existing save status (useSketchPersistence) onto the compact persistence pill.
export function persistencePill(saveStatus) {
  const state = saveStatus?.state;
  if (state === "saving" || state === "pending") return { tone: "amber", label: "Saving...", busy: true };
  if (state === "error") return { tone: "red", label: "Save failed", busy: false };
  if (state === "saved") return { tone: "emerald", label: "Saved · IndexedDB", busy: false };
  return { tone: "slate", label: state === "restoring" ? "Restoring..." : "Ready · IndexedDB", busy: state === "restoring" };
}
