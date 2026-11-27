const CANVAS_TEXT_SELECTOR = ".excalidraw [contenteditable='true'], .excalidraw textarea";

/** Legacy opt-in flag. Spellcheck is now mandatory; the key is only cleaned up. */
export const LEGACY_SPELLCHECK_PREFERENCE_KEY = "sketchizi:spellcheck-enabled";

/** Spellcheck (and space-check) is always on for every canvas text editor. */
export const SPELLCHECK_ENABLED = true;

export function clearLegacySpellcheckPreference(storage = typeof localStorage === "undefined" ? null : localStorage) {
  try { storage?.removeItem(LEGACY_SPELLCHECK_PREFERENCE_KEY); } catch { /* storage can be blocked */ }
}

export function applyCanvasSpellcheck(root = document) {
  if (!root?.querySelectorAll) return 0;
  const fields = root.querySelectorAll(CANVAS_TEXT_SELECTOR);
  fields.forEach((field) => {
    if (field.getAttribute("spellcheck") !== "true") field.setAttribute("spellcheck", "true");
    if (field.getAttribute("autocorrect") !== "on") field.setAttribute("autocorrect", "on");
  });
  return fields.length;
}
