/**
 * Per-tab cloud identity and sync state.
 *
 * Every tab owns its own cloud binding inside `tab.snapshot.cloudSession`
 * (diagramId / revision / name). This module derives one normalized,
 * read-only view of that binding for UI and lookups, so nothing needs a
 * global "the open cloud document" value:
 *   { sourceType, cloudDocId, cloudVersion, syncStatus, isDirty, error }
 */

const SAVE_STATE_TO_SYNC = {
  saved: "synced",
  loading: "syncing",
  pending: "dirty",
  saving: "syncing",
  error: "error",
  conflict: "error",
};

export function getTabCloudMeta(tab, live = null) {
  const session = tab?.snapshot?.cloudSession;
  const detached = tab?.snapshot?.cloudDetached === true;
  const isCloud = Boolean(session?.active && session?.diagramId && !detached);
  // `live` carries the active tab's volatile state (it is not in the snapshot until a switch).
  const saveState = live?.cloudSaveState || tab?.snapshot?.cloudSaveState || { state: "inactive", error: "" };
  const isDirty = Boolean(live ? live.dirty : tab?.dirty);
  if (!isCloud) {
    // A local tab linked to a real file handle is "file"; everything else only
    // lives in this browser as a draft and must never look permanently saved.
    const fileBacked = Boolean(live?.fileBacked ?? tab?.snapshot?.file);
    return { sourceType: "local", cloudDocId: null, cloudVersion: null, syncStatus: fileBacked ? "file" : "draft", fileBacked, isDirty, error: "" };
  }
  let syncStatus = SAVE_STATE_TO_SYNC[saveState.state] || "synced";
  if (syncStatus === "synced" && isDirty) syncStatus = "dirty";
  return {
    sourceType: "cloud",
    cloudDocId: session.diagramId,
    cloudVersion: session.revision ?? null,
    syncStatus,
    isDirty,
    error: saveState.error || "",
  };
}

/** The open tab bound to this cloud document, if any (used to focus instead of reload). */
export function findTabByCloudDocId(tabs, cloudDocId) {
  if (!cloudDocId) return null;
  return (Array.isArray(tabs) ? tabs : []).find((tab) => getTabCloudMeta(tab).cloudDocId === cloudDocId) || null;
}

export function describeTabSync(meta) {
  if (meta.sourceType === "local") return describeLocalTabStatus(meta);
  switch (meta.syncStatus) {
    case "synced": return "Synced to Cloud Workspace";
    case "syncing": return "Syncing to Cloud Workspace…";
    case "dirty": return "Changes waiting to sync";
    case "error": return meta.error ? `Sync error: ${meta.error}` : "Sync error — will retry";
    default: return "Cloud canvas";
  }
}

export const BROWSER_DRAFT_LABEL = "Browser draft (not saved to file)";

/** Label/tooltip for tabs that are not cloud documents. */
export function describeLocalTabStatus(meta) {
  if (meta?.fileBacked) return meta.isDirty ? "Changes not saved to file" : "Saved to disk";
  return BROWSER_DRAFT_LABEL;
}

/** Dot class for the tab bar: green is reserved for file/cloud-backed saves. */
export function getTabStatusClass(meta, saveState = "ready") {
  if (meta?.sourceType === "cloud") return `is-${meta.syncStatus === "synced" ? "saved" : meta.syncStatus === "error" ? "error" : "pending"}`;
  if (saveState === "error") return "is-error";
  if (meta?.fileBacked) return meta.isDirty ? "is-pending" : "is-saved";
  return "is-draft";
}
