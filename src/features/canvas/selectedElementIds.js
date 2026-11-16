/**
 * Excalidraw's selectedElementIds map can retain keys with a false value.
 * Only truthy entries belong to the current active selection.
 */
export function getActiveSelectedElementIds(selectedElementIds) {
  if (!selectedElementIds || typeof selectedElementIds !== "object") return [];
  return Object.entries(selectedElementIds)
    .filter(([, selected]) => selected === true)
    .map(([id]) => id);
}
