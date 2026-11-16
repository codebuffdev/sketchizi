/**
 * Sticky Note Rapid Flow
 * Allows fast brainstorming by auto-spawning adjacent connected notes with Tab and Enter
 */

export function handleStickyNoteRapidFlow(event, api) {
  if (!api || !event) return false;

  // Do not intercept if user is actively typing in an input or textarea
  const targetTag = event.target?.tagName?.toLowerCase();
  if (targetTag === "input" || targetTag === "textarea" || event.target?.isContentEditable) {
    return false;
  }

  const isTab = event.key === "Tab";
  const isEnter = event.key === "Enter" && !event.shiftKey;

  if (!isTab && !isEnter) return false;

  const appState = api.getAppState?.() || {};
  const sceneElements = api.getSceneElements?.() || [];
  const selectedIds = new Set(
    Object.entries(appState.selectedElementIds || {})
      .filter(([, selected]) => selected)
      .map(([id]) => id)
  );

  if (selectedIds.size !== 1) return false;

  const [selectedId] = [...selectedIds];
  const selectedElement = sceneElements.find((el) => el.id === selectedId);
  if (!selectedElement) return false;

  const type = String(selectedElement.type || "").toLowerCase();
  const isNote = type === "note" ||
    type === "sticky-note" ||
    selectedElement.customData?.isNote === true ||
    (selectedElement.backgroundColor && selectedElement.backgroundColor !== "transparent" && selectedElement.width && selectedElement.height);

  if (!isNote) return false;

  event.preventDefault();
  event.stopPropagation();

  const width = Number(selectedElement.width) || 160;
  const height = Number(selectedElement.height) || 160;
  const gap = 24;

  let nextX = selectedElement.x;
  let nextY = selectedElement.y;

  if (isTab) {
    nextX = event.shiftKey ? selectedElement.x - width - gap : selectedElement.x + width + gap;
  } else if (isEnter) {
    nextY = selectedElement.y + height + gap;
  }

  const newId = `note-${Date.now()}`;
  const newNote = {
    ...selectedElement,
    id: newId,
    x: nextX,
    y: nextY,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    text: "",
  };

  api.updateScene?.({
    elements: [...sceneElements, newNote],
    appState: {
      ...appState,
      selectedElementIds: { [newId]: true },
    },
    commitToHistory: true,
  });

  return true;
}
