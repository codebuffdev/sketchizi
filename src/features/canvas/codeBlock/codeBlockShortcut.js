/** Id used on the sketchizi:activate-tool bridge and in the dock model. */
export const CODE_BLOCK_TOOL_ID = "codeblock";

/** True when the focus target is somewhere the user is typing (so single-key shortcuts must stay out). */
export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable === true) return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], .excalidraw-textEditorContainer"));
}

/** Plain "C" (no modifiers, not typing, not auto-repeat) activates the Code Block tool. */
export function isCodeBlockShortcut(event) {
  if (!event || event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  if (String(event.key || "").toLowerCase() !== "c") return false;
  if (isTypingTarget(event.target)) return false;
  return !isPlainCKeyClaimed(event);
}

/**
 * Other features can own a plain "C" in a specific state (the System Design studio uses it to arm a connector).
 * Both listeners are window-level capture handlers that stop propagation, so whichever registered first used to
 * win regardless of context, and this one is registered at app start. A claim lets the owning feature say
 * "I will handle this exact keypress" so the Code Block tool steps aside only then.
 */
const plainCKeyClaims = new Set();

/** Register `claim(event) => boolean`. Returns an unregister function. */
export function registerPlainCKeyClaim(claim) {
  plainCKeyClaims.add(claim);
  return () => { plainCKeyClaims.delete(claim); };
}

function isPlainCKeyClaimed(event) {
  for (const claim of plainCKeyClaims) {
    try { if (claim(event) === true) return true; } catch { /* a faulty claim must never block the shortcut */ }
  }
  return false;
}
