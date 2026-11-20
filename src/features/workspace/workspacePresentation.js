const LAST_OPENED_STORAGE_KEY = "sketchizi.workspace.lastOpened.v1";

function readLastOpened(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LAST_OPENED_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function recordWorkspaceItemOpened(id, timestamp = new Date().toISOString(), storage = globalThis.localStorage) {
  if (!id || !storage) return false;
  try {
    const values = readLastOpened(storage);
    values[id] = timestamp;
    storage.setItem(LAST_OPENED_STORAGE_KEY, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

export function mergeWorkspaceActivity(items = [], storage = globalThis.localStorage) {
  const values = readLastOpened(storage);
  return (Array.isArray(items) ? items : []).map((item) => {
    const localTimestamp = values[item?.id];
    const localTime = localTimestamp ? Date.parse(localTimestamp) : 0;
    const remoteTime = getWorkspaceActivityTime(item);
    return localTime > remoteTime ? { ...item, lastOpenedAt: localTimestamp } : item;
  });
}

export function formatWorkspaceDate(value) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "Recently";
}

export function getWorkspaceActivityTime(item = {}) {
  for (const candidate of [item.lastOpenedAt, item.lastUsedAt, item.updatedAt, item.createdAt]) {
    const value = typeof candidate === "number" ? candidate : Date.parse(candidate || "");
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function sortWorkspaceRecentlyUsed(items = []) {
  return [...items].sort((a, b) => getWorkspaceActivityTime(b) - getWorkspaceActivityTime(a));
}
