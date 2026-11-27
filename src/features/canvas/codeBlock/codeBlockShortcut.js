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
  return !isTypingTarget(event.target);
}
