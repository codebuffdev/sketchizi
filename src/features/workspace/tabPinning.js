/**
 * Tab pinning and quick-switch ordering.
 *
 * Pure functions only: the workspace hooks own state and persistence, the
 * header owns rendering. Keeping the rules here makes the cap, the ordering
 * and the cycling arithmetic testable without a browser.
 */

export const MAX_PINNED_TABS = 2;
export const PIN_LIMIT_MESSAGE = "Maximum 2 pinned tabs allowed — unpin one first";
export const SWITCHER_IDLE_MS = 900;

const isPinned = (tab) => Boolean(tab && tab.pinned && !tab.isTodoTab);

export function countPinnedTabs(tabs) {
  return (Array.isArray(tabs) ? tabs : []).filter(isPinned).length;
}

/**
 * Group pinned tabs at the far left: `[...pinnedTabs, ...unpinnedTabs]`.
 * Relative order inside each group is preserved. A manifest that somehow holds
 * more than MAX_PINNED_TABS pinned tabs (older build, manual edit, restored
 * draft) is repaired by keeping the first ones pinned and unpinning the rest,
 * so the hard cap is an invariant of the stored list, not only of the button.
 */
export function orderTabsByPin(tabs) {
  const list = Array.isArray(tabs) ? tabs : [];
  const pinned = [];
  const unpinned = [];
  list.forEach((tab) => {
    if (isPinned(tab) && pinned.length < MAX_PINNED_TABS) pinned.push(tab);
    else if (tab && tab.pinned) unpinned.push({ ...tab, pinned: false });
    else unpinned.push(tab);
  });
  return [...pinned, ...unpinned];
}

/**
 * Toggle one tab's pinned state.
 * status: "pinned" | "unpinned" | "limit" | "missing"
 * `tabs` is returned already ordered (pinned first) on success and untouched
 * on "limit" / "missing".
 */
export function togglePinTab(tabs, tabId) {
  const list = Array.isArray(tabs) ? tabs : [];
  const target = list.find((tab) => tab?.id === tabId);
  if (!target || target.isTodoTab) return { tabs: list, status: "missing" };
  if (isPinned(target)) {
    return {
      tabs: orderTabsByPin(list.map((tab) => (tab.id === tabId ? { ...tab, pinned: false } : tab))),
      status: "unpinned",
    };
  }
  if (countPinnedTabs(list) >= MAX_PINNED_TABS) return { tabs: list, status: "limit" };
  return {
    tabs: orderTabsByPin(list.map((tab) => (tab.id === tabId ? { ...tab, pinned: true } : tab))),
    status: "pinned",
  };
}

/**
 * The order Ctrl+Tab walks: pinned tabs first, then unpinned. A canvas's Todo
 * view (`todo:<canvasId>`) sits right after its canvas, exactly as the tab bar
 * draws it.
 */
export function buildSwitchOrder(tabs) {
  return orderTabsByPin(tabs).flatMap((tab) => {
    if (!tab) return [];
    const entry = { id: tab.id, name: tab.name, type: tab.type, pinned: isPinned(tab), isTodoTab: false };
    if (!tab.todoTabOpen) return [entry];
    return [entry, { id: `todo:${tab.id}`, name: "Todo", type: "canvas", pinned: false, isTodoTab: true, canvasId: tab.id }];
  });
}

/** Id of the tab the manifest currently shows (a canvas or its Todo view). */
export function getActiveWorkspaceTabId(tabs, activeCanvasId) {
  const active = (Array.isArray(tabs) ? tabs : []).find((tab) => tab?.id === activeCanvasId);
  return active?.todoTabOpen && active?.todoTabActive ? `todo:${activeCanvasId}` : activeCanvasId;
}

/**
 * Next / previous id with wrap-around:
 *   forward  (activeIndex + 1) % n
 *   backward (activeIndex - 1 + n) % n
 * If the active tab is not in the list, forward starts at the first tab and
 * backward at the last.
 */
export function getAdjacentTabId(order, activeId, direction) {
  const list = Array.isArray(order) ? order : [];
  const count = list.length;
  if (count === 0) return null;
  const activeIndex = list.findIndex((tab) => tab.id === activeId);
  if (activeIndex < 0) return list[direction < 0 ? count - 1 : 0].id;
  const step = direction < 0 ? -1 : 1;
  return list[(activeIndex + step + count) % count].id;
}

/**
 * Classify a keydown as a tab-switch chord.
 *   Ctrl+Tab / Ctrl+Shift+Tab           -> +1 / -1
 *   Ctrl+] / Ctrl+[ (browser fallbacks) -> +1 / -1
 * Returns { direction, fallback } or null. The fallback chords are reported so
 * the caller can leave them alone inside code/text editors, where they indent.
 */
export function classifyTabSwitchKey(event) {
  if (!event || !event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.key === "Tab") return { direction: event.shiftKey ? -1 : 1, fallback: false };
  if (!event.shiftKey && event.key === "]") return { direction: 1, fallback: true };
  if (!event.shiftKey && event.key === "[") return { direction: -1, fallback: true };
  return null;
}
