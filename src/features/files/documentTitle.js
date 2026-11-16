export const DEFAULT_SKETCHIZI_DOCUMENT_TITLE = "Sketchizi -- Free Online Diagram & Architecture Designer";

export function getCanvasBrowserTitle(canvasName) {
  const name = String(canvasName || "").trim();
  if (!name || name === "Untitled drawing") return DEFAULT_SKETCHIZI_DOCUMENT_TITLE;
  return `${name} - Sketchizi`;
}
