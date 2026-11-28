// Pure decision logic for the System Design "C" connect shortcut, shared by the overlay's key handler and by the
// claim it registers with the Code Block shortcut so both always agree on who owns the keypress.

export const CONNECT_KEY_BLOCKED_TARGET = "input, textarea, select, [contenteditable='true'], [data-sketchizi-inline-editor]";

/** Plain "c": no modifiers. */
export function isConnectKeyEvent(event) {
  return Boolean(event) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    && String(event.key || "").toLowerCase() === "c";
}

export function isConnectKeyBlockedTarget(target) {
  return Boolean(target?.closest?.(CONNECT_KEY_BLOCKED_TARGET));
}

/**
 * What a plain C does. Selection is authoritative; with nothing selected at all, the hovered card is the
 * fallback. Two or more selected cards connect the first to the second. Returns null when C is not ours
 * (for example a selected connector or shape, or no card selected/hovered), so other shortcuts keep working.
 */
export function resolveConnectKeyAction({ selectedIds, isNode, hoverId }) {
  const selectedNodes = selectedIds.filter(isNode);
  if (selectedNodes.length >= 2) return { type: "connect", fromId: selectedNodes[0], toId: selectedNodes[1] };
  const sourceId = selectedNodes[0] || (selectedIds.length === 0 ? hoverId : null);
  return sourceId ? { type: "arm", sourceId } : null;
}
