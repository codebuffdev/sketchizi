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

/**
 * Validate a proposed relationship against the complete semantic model.
 * Endpoint-kind validation alone is insufficient when a damaged document has
 * duplicate entity IDs: the UI could otherwise connect an ambiguous identity.
 */
export function validateRelationAgainstModel(relationKind, sourceEntity, targetEntity, entities = [], relations = []) {
  const endpointCheck = validateRelationEndpoints(relationKind, sourceEntity, targetEntity);
  if (!endpointCheck.valid) return endpointCheck;

  if (!Array.isArray(entities) || !Array.isArray(relations)) {
    return { valid: false, reason: "The Workbench model is not available for relationship validation." };
  }

  const matchingSource = entities.filter((entity) => entity?.id === sourceEntity.id);
  const matchingTarget = entities.filter((entity) => entity?.id === targetEntity.id);
  if (matchingSource.length !== 1 || matchingTarget.length !== 1) {
    return { valid: false, reason: "Relationship endpoints must have unique component IDs in the Workbench model." };
  }
  if (matchingSource[0].kind !== sourceEntity.kind || matchingTarget[0].kind !== targetEntity.kind) {
    return { valid: false, reason: "Relationship endpoints do not match the component definitions in the Workbench model." };
  }

  const duplicate = relations.some((relation) => relation?.kind === relationKind
    && relation.sourceId === sourceEntity.id
    && relation.targetId === targetEntity.id);
  if (duplicate) return { valid: false, reason: "This typed relationship already exists." };

  return { valid: true, reason: "" };
}

export function createWorkbenchRelation({ id, kind, sourceEntity, targetEntity, viewId, properties = {} }) {
  const check = validateRelationEndpoints(kind, sourceEntity, targetEntity);
  if (!check.valid) throw new Error(check.reason);
  if (!id || !viewId) throw new TypeError("Relation id and view id are required.");
  return { id, kind, sourceId: sourceEntity.id, targetId: targetEntity.id, viewIds: [viewId], properties: structuredClone(properties) };
}


const WORKBENCH_HLD_PARENT_KINDS = new Set(["backend.rest-service", "backend.worker", "frontend.react-app"]);
const WORKBENCH_LLD_CHILD_KINDS = new Set([
  "backend.api-endpoint", "backend.rest-controller", "backend.java-interface", "backend.java-class",
  "backend.repository", "data.postgresql-table", "design.domain-entity",
]);

/** Validate explicit HLD ownership before it is written into the semantic model. */
export function validateImplementationOwnership(entities, childKind, parentId) {
  if (parentId === "" || parentId == null) return { valid: true, reason: "" };
  if (!Array.isArray(entities)) return { valid: false, reason: "The Workbench model is not available for ownership validation." };
  if (!WORKBENCH_LLD_CHILD_KINDS.has(childKind)) return { valid: false, reason: "Only low-level design components can be assigned to an HLD parent." };
  const parents = entities.filter((entity) => entity?.id === parentId);
  if (parents.length !== 1 || !WORKBENCH_HLD_PARENT_KINDS.has(parents[0]?.kind)) {
    return { valid: false, reason: "The implementation parent must identify exactly one supported HLD service component." };
  }
  return { valid: true, reason: "" };
}

export function updateWorkbenchEntity(entities, entityId, patch) {
  const target = entities.find((entity) => entity.id === entityId);
  if (!target) throw new Error(`Component not found: ${entityId}.`);
  if (patch?.properties && Object.prototype.hasOwnProperty.call(patch.properties, "implementationParentId")) {
    const ownership = validateImplementationOwnership(entities, target.kind, patch.properties.implementationParentId);
    if (!ownership.valid) throw new Error(ownership.reason);
  }
  const next = entities.map((entity) => entity.id === entityId ? {
    ...entity,
    ...(typeof patch.name === "string" ? { name: patch.name } : {}),
    ...(patch.properties ? { properties: { ...(entity.properties || {}), ...structuredClone(patch.properties) } } : {}),
  } : entity);
  return next;
}
