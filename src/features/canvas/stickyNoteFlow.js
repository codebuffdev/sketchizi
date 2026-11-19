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

  const groupId = selectedElement.customData?.stickyNoteGroup;
  const group = groupId
    ? sceneElements.filter((element) => element.groupIds?.includes(groupId))
    : [selectedElement];
  const newId = `note-${Date.now()}`;
  const newGroupId = groupId ? `${groupId}-${newId}` : null;
  const clones = group.map((element, index) => ({
    ...element,
    id: index === 0 ? newId : `${newId}-${index}`,
    x: element.x + (nextX - selectedElement.x),
    y: element.y + (nextY - selectedElement.y),
    groupIds: newGroupId ? element.groupIds.map((id) => id === groupId ? newGroupId : id) : element.groupIds,
    customData: element.customData?.stickyNoteGroup
      ? { ...element.customData, stickyNoteGroup: newGroupId }
      : element.customData,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    isDeleted: false,
    text: "",
  }));

  api.updateScene?.({
    elements: [...sceneElements, ...clones],
    appState: {
      ...appState,
      selectedElementIds: { [newId]: true },
    },
    commitToHistory: true,
  });

  return true;
}
