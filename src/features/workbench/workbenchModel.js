import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS } from "./workbenchRegistry.js";

export function getComponentDefinition(kind) {
  return WORKBENCH_COMPONENTS.find((item) => item.kind === kind) || null;
}

export function getRelationDefinition(kind) {
  return WORKBENCH_RELATIONS.find((item) => item.kind === kind) || null;
}

export function validateRelationEndpoints(relationKind, sourceEntity, targetEntity) {
  const definition = getRelationDefinition(relationKind);
  if (!definition) return { valid: false, reason: `Unknown relation type: ${relationKind}.` };
  if (!sourceEntity || !targetEntity) return { valid: false, reason: "Choose both a source and a target component." };
  if (sourceEntity.id === targetEntity.id) return { valid: false, reason: "A component cannot be related to itself." };
  if (!definition.sourceKinds.includes(sourceEntity.kind)) {
    return { valid: false, reason: `${definition.label} cannot start at ${getComponentDefinition(sourceEntity.kind)?.label || sourceEntity.kind}.` };
  }
  if (!definition.targetKinds.includes(targetEntity.kind)) {
    return { valid: false, reason: `${definition.label} cannot target ${getComponentDefinition(targetEntity.kind)?.label || targetEntity.kind}.` };
  }
  return { valid: true, reason: "" };
}

export function createWorkbenchRelation({ id, kind, sourceEntity, targetEntity, viewId, properties = {} }) {
  const check = validateRelationEndpoints(kind, sourceEntity, targetEntity);
  if (!check.valid) throw new Error(check.reason);
  if (!id || !viewId) throw new TypeError("Relation id and view id are required.");
  return { id, kind, sourceId: sourceEntity.id, targetId: targetEntity.id, viewIds: [viewId], properties: structuredClone(properties) };
}

export function updateWorkbenchEntity(entities, entityId, patch) {
  const target = entities.find((entity) => entity.id === entityId);
  if (!target) throw new Error(`Component not found: ${entityId}.`);
  const next = entities.map((entity) => entity.id === entityId ? {
    ...entity,
    ...(typeof patch.name === "string" ? { name: patch.name } : {}),
    ...(patch.properties ? { properties: { ...(entity.properties || {}), ...structuredClone(patch.properties) } } : {}),
  } : entity);
  return next;
}
