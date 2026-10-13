// Font-family identifiers supported by the pinned @excalidraw/excalidraw 0.18.0 build.
// Keep these numeric IDs aligned with Excalidraw's FONT_FAMILY constants.
export const DEFAULT_FONT_FAMILY_ID = 5; // FONT_FAMILY.Excalifont
const SUPPORTED_FONT_FAMILY_IDS = new Set([1, 2, 3, 5, 6, 7, 8, 9]);

export function normalizeFontFamilyId(value) {
  return typeof value === "number" && Number.isInteger(value) && SUPPORTED_FONT_FAMILY_IDS.has(value)
    ? value
    : null;
}

export function getTextFontFamilyMap(elements = []) {
  const result = new Map();
  for (const element of elements) {
    if (!element || element.isDeleted || element.type !== "text" || typeof element.id !== "string") continue;
    const fontFamily = normalizeFontFamilyId(element.fontFamily);
    if (fontFamily !== null) result.set(element.id, fontFamily);
  }
  return result;
}

/**
 * Detect a font choice as soon as Excalidraw changes currentItemFontFamily while
 * the font picker is open. Excalidraw 0.18 updates this appState field before
 * it closes the popup, so waiting only for the popup-close transition loses the
 * choice and allows the default to overwrite it. A selected-element change is
 * retained as a fallback for version-specific callback ordering. Merely selecting
 * a text element does not change the default.
 */
export function detectFontFamilyPreferenceChange({
  previousAppState,
  appState,
  previousTextFontFamilies = new Map(),
  elements = [],
  ignoreElementChanges = false,
} = {}) {
  const previousFont = normalizeFontFamilyId(previousAppState?.currentItemFontFamily);
  const currentFont = normalizeFontFamilyId(appState?.currentItemFontFamily);
  const fontPickerWasOrIsOpen = previousAppState?.openPopup === "fontFamily" || appState?.openPopup === "fontFamily";

  // Capture the change while the picker is still open. Do not rely on seeing
  // currentItemFontFamily change again when the popup closes: it may already
  // contain the selected font by then.
  if (fontPickerWasOrIsOpen && currentFont !== null && currentFont !== previousFont) {
    return currentFont;
  }

  if (ignoreElementChanges) return null;

  const selectedIds = new Set(
    Object.entries(appState?.selectedElementIds || {})
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id),
  );
  const editingId = appState?.editingTextElement?.id;
  if (editingId) selectedIds.add(editingId);
  if (!selectedIds.size) return null;

  const changedFamilies = new Set();
  for (const element of elements) {
    if (!element || element.isDeleted || element.type !== "text" || !selectedIds.has(element.id)) continue;
    const previousFamily = previousTextFontFamilies.get(element.id);
    const nextFamily = normalizeFontFamilyId(element.fontFamily);
    if (previousFamily !== undefined && nextFamily !== null && previousFamily !== nextFamily) {
      changedFamilies.add(nextFamily);
    }
  }

  return changedFamilies.size === 1 ? [...changedFamilies][0] : null;
}
