/**
 * Recently closed canvas tabs ("local drafts").
 *
 * Pure helpers only: the persistence layer (persistence.js) stores the list in
 * IndexedDB and App.jsx wires the UI. Keeping the rules here makes them easy
 * to regression-test without mounting Excalidraw.
 */

export const MAX_CLOSED_TABS = 15;

function isLiveElement(element) {
  return Boolean(element) && !element.isDeleted;
}

/** True when the tab has scene content or an explicitly active studio session to recover. */
export function snapshotHasContent(snapshot) {
  return Boolean(snapshot?.systemDesign?.active)
    || (Array.isArray(snapshot?.elements) && snapshot.elements.some(isLiveElement));
}

/**
 * A tab is "backed" when its work already lives in a real file or cloud
 * document. Everything else only exists as a browser draft.
 */
export function isTabBackedByFileOrCloud(snapshot) {
  if (!snapshot) return false;
  const cloud = Boolean(snapshot.cloudSession?.active && snapshot.cloudSession?.diagramId && snapshot.cloudDetached !== true);
  return cloud || Boolean(snapshot.file);
}

/** Build a persistable closed-tab record. Returns null for empty canvases. */
export function buildClosedTabRecord(tab, snapshot, now = Date.now()) {
  const source = snapshot || tab?.snapshot;
  if (!tab || !snapshotHasContent(source)) return null;
  const { snapshot: _ignored, dirty: _dirty, active: _active, todoTabActive: _todoActive, ...shell } = tab;
  return {
    closedId: `closed-${now}-${String(tab.id || "tab").replace(/[^\w-]/g, "")}`,
    closedAt: now,
    originalId: tab.id,
    name: tab.name || "Untitled canvas",
    tab: { ...shell, todoTabOpen: false },
    snapshot: {
      elements: source.elements,
      appState: source.appState || {},
      files: source.files || {},
      metadata: source.metadata || {},
      extensions: source.extensions || {},
      format: source.format || "excalidraw",
      // System Design mode and controls travel with the scene into closed-tab recovery.
      systemDesign: source.systemDesign || tab.snapshot?.systemDesign || { active: false, studioMode: "canvas", simRunning: false, baseRps: 10000, inspectorOpen: false },
      // A reopened draft is a plain browser draft: it must not silently
      // re-attach to a cloud document or file handle that may have moved on.
      file: null,
      fileSceneSignature: null,
      cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" },
      cloudDetached: true,
      cloudSaveState: { state: "inactive", error: "" },
      cloudDocumentName: "Cloud diagram",
    },
  };
}

/** Newest first, de-duplicated by closedId, capped at MAX_CLOSED_TABS. */
export function pushClosedTab(list, record, max = MAX_CLOSED_TABS) {
  const current = Array.isArray(list) ? list : [];
  if (!record) return current.slice(0, max);
  return [record, ...current.filter((item) => item?.closedId !== record.closedId)].slice(0, max);
}

export function removeClosedTab(list, closedId) {
  return (Array.isArray(list) ? list : []).filter((item) => item?.closedId !== closedId);
}

/** Drop malformed entries that could crash the UI after a bad write. */
export function normalizeClosedTabs(list, max = MAX_CLOSED_TABS) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item.closedId === "string" && item.snapshot && Array.isArray(item.snapshot.elements))
    .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    .slice(0, max);
}

/** Turn a closed record back into an open tab with a fresh, unique id. */
export function restoreClosedTab(record, existingIds = [], now = Date.now()) {
  if (!record?.snapshot) return null;
  const taken = new Set(existingIds);
  let id = `canvas-${now}`;
  for (let n = 2; taken.has(id); n += 1) id = `canvas-${now}-${n}`;
  return {
    ...(record.tab || {}),
    id,
    name: record.name || record.tab?.name || "Untitled canvas",
    dirty: true,
    pinned: false,
    todoTabOpen: false,
    todoTabActive: false,
    snapshot: record.snapshot,
  };
}

export function countLiveElements(record) {
  return (record?.snapshot?.elements || []).filter(isLiveElement).length;
}

/** Short relative label, e.g. "Closed 5 min ago". */
export function describeClosedAt(record, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - (record?.closedAt ?? now)) / 60000));
  if (minutes < 1) return "Closed just now";
  if (minutes < 60) return `Closed ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Closed ${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `Closed ${days} ${days === 1 ? "day" : "days"} ago`;
}
