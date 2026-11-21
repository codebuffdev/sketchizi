export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidCanvasStartDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatCanvasStartDate(value, locale) {
  if (!isValidCanvasStartDate(value)) return "Set start date";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

/** Fresh per-tab date metadata: a new board starts (and was created) today. */
export function createTabDates(date = new Date()) {
  const today = getLocalDateString(date);
  return { startDate: today, createdDate: today };
}

/** Repairs persisted tabs: valid startDate, plus the original date Reset restores. */
export function normalizeTabDates(tab, today = getLocalDateString()) {
  const startDate = isValidCanvasStartDate(tab?.startDate) ? tab.startDate : today;
  const createdDate = isValidCanvasStartDate(tab?.createdDate) ? tab.createdDate : startDate;
  return { startDate, createdDate };
}
