/**
 * Pure decisions for closing a canvas tab. Keeping them outside App.jsx lets
 * the last-tab scenario be regression-tested without mounting Excalidraw.
 */

/** Work out what remains after closing `closingId` and which tab becomes active. */
export function resolveTabClose({ tabs = [], closingId, activeId = "" } = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  const index = list.findIndex((tab) => tab?.id === closingId);
  if (index < 0) return { found: false, remainingTabs: list, nextActiveId: activeId, returnToWelcome: false };
  const remainingTabs = list.filter((tab) => tab?.id !== closingId);
  if (remainingTabs.length === 0) {
    return { found: true, remainingTabs, nextActiveId: "", returnToWelcome: true };
  }
  const closingActive = closingId === activeId;
  const nextActive = closingActive ? (list[index - 1] || remainingTabs[0]) : null;
  return {
    found: true,
    remainingTabs,
    nextActiveId: nextActive ? nextActive.id : activeId,
    returnToWelcome: false,
  };
}

/**
 * The canvas may only be mounted while an open tab owns it. A stale active id
 * that no longer matches a tab must never keep the old scene on screen.
 */
export function hasMountableCanvas({ tabs = [], activeCanvasId = "" } = {}) {
  if (!activeCanvasId) return false;
  return (Array.isArray(tabs) ? tabs : []).some((tab) => tab?.id === activeCanvasId);
}
