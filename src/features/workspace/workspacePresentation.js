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
