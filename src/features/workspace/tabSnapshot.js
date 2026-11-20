import { sanitizeCloudAppState } from "./cloudDocument.js";

/**
 * Canvas tab snapshots used to embed Excalidraw's raw appState. That object
 * holds runtime-only values (open menus, context menus, collaborators Map,
 * active tool, ...) which are not reliably structured-cloneable and which, when
 * re-applied on a tab switch, restore stale tool/menu state. Tabs now keep the
 * same stable, JSON-safe view settings that single-sketch saves already use.
 */
export function sanitizeTabAppState(appState) {
  return sanitizeCloudAppState(appState && typeof appState === "object" ? appState : {});
}

function isStructuredCloneable(value) {
  try { structuredClone(value); return true; } catch { return false; }
}

function viaJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return undefined; }
}

/**
 * Return a copy of `tabs` that is guaranteed to be structured-cloneable so that
 * one bad tab can never make IndexedDB reject the whole manifest (which also
 * carries every tab's Todo items). Degradation order per tab:
 *   1. sanitize snapshot.appState
 *   2. JSON round-trip the tab (drops functions / non-serialisable values)
 *   3. keep the tab shell (name, todo fields, ...) without its snapshot and
 *      mark it with `snapshotDropped: true`
 */
export function prepareTabsForPersistence(tabs) {
  return (Array.isArray(tabs) ? tabs : []).map((tab) => {
    if (!tab || typeof tab !== "object") return tab;
    const candidate = tab.snapshot && typeof tab.snapshot === "object"
      ? { ...tab, snapshot: { ...tab.snapshot, appState: sanitizeTabAppState(tab.snapshot.appState) } }
      : tab;
    if (isStructuredCloneable(candidate)) return candidate;
    const jsonCopy = viaJson(candidate);
    if (jsonCopy && isStructuredCloneable(jsonCopy)) return jsonCopy;
    const { snapshot: _dropped, ...shell } = candidate;
    const shellCopy = isStructuredCloneable(shell) ? shell : viaJson(shell);
    return { ...(shellCopy || { id: tab.id, name: tab.name }), snapshotDropped: true };
  });
}

/**
 * `canvas-${Date.now()}` collides when two tabs are created within the same
 * millisecond (or the clock does not advance), producing duplicate React keys
 * and a tab that cannot be told apart from its twin. Keep the familiar prefix
 * and add a counter suffix only when needed.
 */
export function createCanvasTabId(existingIds = [], now = Date.now()) {
  const taken = new Set(existingIds);
  const base = `canvas-${now}`;
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}
