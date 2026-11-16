function formatRelativeTime(timestamp, now) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const elapsed = Math.max(0, now - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "just now";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} min ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} hr ago`;
  if (elapsed < 7 * day) {
    const days = Math.floor(elapsed / day);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  const date = new Date(value);
  try {
    const options = { month: "short", day: "numeric" };
    if (date.getFullYear() !== new Date(now).getFullYear()) options.year = "numeric";
    return date.toLocaleDateString(undefined, options);
  } catch {
    return "earlier";
  }
}

export function getRecentFolderActivityLabel(item = {}, now = Date.now()) {
  const openedAt = Number(item.openedAt);
  if (Number.isFinite(openedAt) && openedAt > 0) return `Opened ${formatRelativeTime(openedAt, now)}`;
  return "Recently used";
}

export function getRecentFolderTypeLabel(item = {}) {
  if (item.fallback || item.accessMode === "read-only") return "READ-ONLY";
  return "FOLDER";
}

export function getRecentFolderAvailability(item = {}) {
  if (item.availability === "missing") {
    return {
      label: "Unavailable",
      message: "The saved folder reference is no longer available. Reopen the folder to reconnect, or remove it from Recent folders.",
    };
  }
  if (item.availability === "permission") {
    return {
      label: "Permission needed",
      message: "Browser access was denied. Reopen this folder to request permission again.",
    };
  }
  if (item.availability === "read-only" || item.fallback || item.accessMode === "read-only") {
    return {
      label: "Read-only",
      message: "This folder was selected through the browser fallback and cannot be refreshed or written to directly.",
    };
  }
  return null;
}
