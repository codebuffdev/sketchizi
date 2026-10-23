const FILE_TYPES = new Map([
  [".sketchizi", "SKETCHIZI"],
  [".excalidraw", "EXCALIDRAW"],
  [".json", "JSON"],
]);

function getExtension(name = "") {
  const match = String(name).trim().match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

export function getRecentFileTypeLabel(item = {}) {
  const extension = getExtension(item.name);
  return FILE_TYPES.get(extension) || (item.kind === "snapshot" ? "LOCAL DRAWING" : "DRAWING");
}

export function getRecentFileOriginLabel(item = {}) {
  return item.kind === "file" ? "Linked file" : "Browser-local copy";
}

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
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)} days ago`;
  const date = new Date(value);
  try {
    const options = { month: "short", day: "numeric" };
    if (date.getFullYear() !== new Date(now).getFullYear()) options.year = "numeric";
    return date.toLocaleDateString(undefined, options);
  } catch {
    return "earlier";
  }
}

export function getRecentFileActivityLabel(item = {}, now = Date.now()) {
  const openedAt = Number(item.lastOpenedAt);
  if (Number.isFinite(openedAt) && openedAt > 0) return `Opened ${formatRelativeTime(openedAt, now)}`;
  const addedAt = Number(item.savedAt);
  if (Number.isFinite(addedAt) && addedAt > 0) return `Added ${formatRelativeTime(addedAt, now)}`;
  return "Recently added";
}

export function getRecentFileAvailability(item = {}) {
  if (item.availability === "missing") {
    return { label: "Unavailable", message: "This file or local copy could not be found. Select to retry, or remove it from Recent files." };
  }
  if (item.availability === "permission") {
    return { label: "Permission needed", message: "Access was denied. Select to request file access again." };
  }
  return null;
}
