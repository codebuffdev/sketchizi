/**
 * Experimental, UI-independent multi-view document helpers.
 *
 * Active view layout lives in the standard Sketchizi `diagram` scene.
 * Inactive view layouts live under extensions[WORKBENCH_EXTENSION_KEY].viewScenes.
 * Semantic entities/relations are stored once in the extension; Excalidraw elements
 * are only view-specific placements and refer to semantic IDs via customData.
 */
export const WORKBENCH_EXTENSION_KEY = "com.sketchizi.workbench";
export const WORKBENCH_SCHEMA_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireId(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function cloneScene(scene, label = "scene") {
  if (!isRecord(scene) || !Array.isArray(scene.elements)) {
    throw new TypeError(`${label} must contain an elements array.`);
  }
  return {
    elements: structuredClone(scene.elements),
    appState: isRecord(scene.appState) ? structuredClone(scene.appState) : {},
    files: isRecord(scene.files) ? structuredClone(scene.files) : {},
  };
}

function validateWorkbench(workbench) {
  if (!isRecord(workbench)) throw new TypeError("Workbench data must be an object.");
  if (workbench.schemaVersion !== WORKBENCH_SCHEMA_VERSION) {
    throw new Error(`Unsupported Workbench schema version: ${String(workbench.schemaVersion)}.`);
  }
  if (!Array.isArray(workbench.views) || workbench.views.length === 0) {
    throw new TypeError("Workbench data must define at least one view.");
  }
  if (!Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    throw new TypeError("Workbench entities and relations must be arrays.");
  }
  const viewIds = new Set();
  for (const view of workbench.views) {
    requireId(view?.id, "View id");
    if (viewIds.has(view.id)) throw new Error(`Duplicate view id: ${view.id}.`);
    viewIds.add(view.id);
  }
  if (!viewIds.has(requireId(workbench.activeViewId, "Active view id"))) {
    throw new Error(`Active view does not exist: ${workbench.activeViewId}.`);
  }
  const entityIds = new Set();
  for (const entity of workbench.entities) {
    requireId(entity?.id, "Entity id");
    if (entityIds.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}.`);
    entityIds.add(entity.id);
  }
  const relationIds = new Set();
  for (const relation of workbench.relations) {
    requireId(relation?.id, "Relation id");
    if (relationIds.has(relation.id)) throw new Error(`Duplicate relation id: ${relation.id}.`);
    relationIds.add(relation.id);
    if (!entityIds.has(relation.sourceId) || !entityIds.has(relation.targetId)) {
      throw new Error(`Relation ${relation.id} references a missing entity.`);
    }
  }
  if (!isRecord(workbench.viewScenes)) throw new TypeError("Workbench viewScenes must be an object.");
  if (workbench.policyGovernance != null && (!isRecord(workbench.policyGovernance) || !Array.isArray(workbench.policyGovernance.policyHistory) || !Array.isArray(workbench.policyGovernance.approvalEvents))) {
    throw new TypeError("Workbench policy governance must contain policyHistory and approvalEvents arrays.");
  }
  for (const viewId of Object.keys(workbench.viewScenes)) {
    if (!viewIds.has(viewId)) throw new Error(`Layout exists for unknown view: ${viewId}.`);
    if (viewId === workbench.activeViewId) {
      throw new Error("The active view layout must live in the top-level diagram, not viewScenes.");
    }
    cloneScene(workbench.viewScenes[viewId], `Layout for view ${viewId}`);
  }
  return workbench;
}

/** Create normalized Workbench extension data from plain JSON-compatible values. */
export function createWorkbenchExtension({
  activeViewId,
  modelRevision = 0,
  entities = [],
  relations = [],
  views = [],
  viewScenes = {},
  policyGovernance = { policyHistory: [], approvalEvents: [] },
} = {}) {
  const workbench = {
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    modelRevision: Number.isSafeInteger(modelRevision) && modelRevision >= 0 ? modelRevision : 0,
    activeViewId: requireId(activeViewId, "Active view id"),
    entities: structuredClone(entities),
    relations: structuredClone(relations),
    views: structuredClone(views),
    viewScenes: Object.fromEntries(Object.entries(viewScenes).map(([id, scene]) => [id, cloneScene(scene, `Layout for view ${id}`)])),
    policyGovernance: {
      policyHistory: Array.isArray(policyGovernance?.policyHistory) ? structuredClone(policyGovernance.policyHistory) : [],
      approvalEvents: Array.isArray(policyGovernance?.approvalEvents) ? structuredClone(policyGovernance.approvalEvents) : [],
    },
  };
  validateWorkbench(workbench);
  return workbench;
}

/** Preserve extensions owned by other features/vendors when updating Workbench data. */
export function withWorkbenchExtension(extensions, workbench) {
  validateWorkbench(workbench);
  return {
    ...(isRecord(extensions) ? structuredClone(extensions) : {}),
    [WORKBENCH_EXTENSION_KEY]: structuredClone(workbench),
  };
}

/** Read Workbench data from parseDrawing() output; ordinary files remain ordinary. */
export function readWorkbenchDocument(drawing) {
  const extensions = isRecord(drawing?.extensions) ? drawing.extensions : {};
  const candidate = extensions[WORKBENCH_EXTENSION_KEY];
  if (candidate == null) return { workbench: null, activeScene: cloneScene(drawing || {}, "Active drawing") };
  validateWorkbench(candidate);
  const activeScene = cloneScene(drawing || {}, "Active drawing");
  return { workbench: structuredClone(candidate), activeScene };
}

/**
 * Switch active view without duplicating layout scenes. The previous active scene
 * is stored in viewScenes and the target's scene is promoted to the active slot.
 */
export function activateWorkbenchView({ workbench, currentScene, targetViewId }) {
  validateWorkbench(workbench);
  requireId(targetViewId, "Target view id");
  if (!workbench.views.some((view) => view.id === targetViewId)) {
    throw new Error(`Target view does not exist: ${targetViewId}.`);
  }
  if (targetViewId === workbench.activeViewId) {
    return { workbench: structuredClone(workbench), scene: cloneScene(currentScene, "Current scene") };
  }
  if (!Object.hasOwn(workbench.viewScenes, targetViewId)) {
    throw new Error(`No saved layout exists for target view: ${targetViewId}.`);
  }

  const next = structuredClone(workbench);
  next.viewScenes[next.activeViewId] = cloneScene(currentScene, "Current scene");
  const scene = cloneScene(next.viewScenes[targetViewId], `Layout for view ${targetViewId}`);
  delete next.viewScenes[targetViewId];
  next.activeViewId = targetViewId;
  validateWorkbench(next);
  return { workbench: next, scene };
}
