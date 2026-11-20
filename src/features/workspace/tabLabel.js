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
