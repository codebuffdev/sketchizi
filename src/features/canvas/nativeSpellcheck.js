const CANVAS_TEXT_SELECTOR = ".excalidraw [contenteditable='true'], .excalidraw textarea";

export const SPELLCHECK_PREFERENCE_KEY = "sketchizi:spellcheck-enabled";

// Spellcheck is opt-in: technical terms (k8s, vpc, postgres, nginx...) must not
// get red squiggles unless the person explicitly turns native spellcheck on.
export function readSpellcheckPreference(storage = typeof localStorage === "undefined" ? null : localStorage) {
  try {
    return storage?.getItem(SPELLCHECK_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function applyCanvasSpellcheck(root = document, enabled = false) {
  if (!root?.querySelectorAll) return 0;
  const value = enabled ? "true" : "false";
  const fields = root.querySelectorAll(CANVAS_TEXT_SELECTOR);
  fields.forEach((field) => {
    if (field.getAttribute("spellcheck") !== value) field.setAttribute("spellcheck", value);
  });
  return fields.length;
}
