import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { buildPresetSkeleton } from "./presetShapes.js";

const newGroupId = () => `grp-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

/** Scene coordinates of the middle of the visible canvas. */
export function viewportCenter(appState = {}) {
  const zoom = Number(appState.zoom?.value) || 1;
  return {
    cx: (Number(appState.width) || 800) / 2 / zoom - (Number(appState.scrollX) || 0),
    cy: (Number(appState.height) || 600) / 2 / zoom - (Number(appState.scrollY) || 0),
  };
}

/**
 * Insert a preset shape at the viewport centre as real, selectable elements,
 * then return to the selection tool. Returns the inserted elements, or [].
 */
export function insertPresetShape(api, kind) {
  if (!api?.updateScene || !api.getSceneElements) return [];
  const appState = api.getAppState?.() || {};
  const skeleton = buildPresetSkeleton(kind, viewportCenter(appState));
  if (!skeleton.length) return [];

  let converted = convertToExcalidrawElements(skeleton);
  let groupId = null;
  if (kind === "cylinder") {
    groupId = newGroupId();
    converted = converted.map((element) => ({ ...element, groupIds: [groupId] }));
  }
  const inserted = restoreElements(converted, null, { deleteInvisibleElements: true });
  if (!inserted.length) return [];

  const selectable = inserted.filter((element) => element.type !== "text" || !element.containerId);
  const selectedElementIds = Object.fromEntries(selectable.map((element) => [element.id, true]));
  api.updateScene({
    elements: [...api.getSceneElements(), ...inserted],
    appState: { selectedElementIds, selectedGroupIds: groupId ? { [groupId]: true } : {} },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool?.({ type: "selection" });
  return inserted;
}
