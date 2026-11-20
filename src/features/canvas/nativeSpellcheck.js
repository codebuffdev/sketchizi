const CANVAS_TEXT_SELECTOR = ".excalidraw [contenteditable='true'], .excalidraw textarea";

export function enableCanvasSpellcheck(root = document) {
  if (!root?.querySelectorAll) return 0;
  const fields = root.querySelectorAll(CANVAS_TEXT_SELECTOR);
  fields.forEach((field) => {
    if (field.getAttribute("spellcheck") !== "true") field.setAttribute("spellcheck", "true");
  });
  return fields.length;
}
