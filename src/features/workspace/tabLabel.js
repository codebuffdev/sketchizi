export const MAX_TAB_LABEL_CHARACTERS = 70;

/**
 * Display-only truncation for tab labels. The stored tab name is never
 * changed; callers keep the full name for state, persistence and tooltips.
 * Counts user-perceived code points so emoji are not split in half.
 */
export function getTabDisplayName(name, limit = MAX_TAB_LABEL_CHARACTERS) {
  const text = typeof name === "string" ? name : String(name ?? "");
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  return characters.slice(0, limit).join("");
}

/** Return an already-open canvas tab with the same normalized name. */
export function findDuplicateTabName(tabs, name, excludeId = null) {
  const normalized = String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!normalized) return null;
  return (Array.isArray(tabs) ? tabs : []).find((tab) =>
    tab && !tab.isTodoTab && tab.id !== excludeId
    && String(tab.name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalized
  ) || null;
}
