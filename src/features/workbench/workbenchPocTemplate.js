import { createIllustrativeSimulationProfile } from "../simulation/experiments/simulationExperimentModel.js";
import { createWorkbenchRelation, getComponentDefinition, validateRelationEndpoints } from "./workbenchModel.js";

export const REACT_REST_POSTGRES_TEMPLATE = Object.freeze({
  id: "react-rest-postgresql",
  version: 1,
  name: "Web application with database",
  description: "A preconfigured full-stack request path with typed connections and editable synthetic experiment profiles.",
  componentKinds: ["frontend.react-app", "backend.rest-service", "data.postgresql-database"],
});

function defaultProperties(definition) {
  return Object.fromEntries((definition?.properties || []).map((property) => [property.key, structuredClone(property.defaultValue ?? "")]));
}

function requireModel(value) {
  if (!value || !Array.isArray(value.entities) || !Array.isArray(value.relations) || !Array.isArray(value.views)) {
    throw new TypeError("An initialized Workbench model is required before creating a POC.");
  }
  if (value.activeViewId !== "system") {
    throw new Error("Switch to the System view before creating this POC template.");
  }
  if (value.entities.length || value.relations.length) {
    throw new Error("Create POC is available only when the Workbench has no semantic components yet. Existing diagrams and models will not be overwritten.");
  }
}

/**
 * Create the canonical semantic model and profiles for the full-stack POC.
 * Scene elements are created separately by the controller, so a caller can
 * build and validate everything before committing one canvas/document update.
 */
export function createReactRestPostgresPoc({ workbench, idFactory, durationMs = 15000, seed = 211 } = {}) {
  requireModel(workbench);
  if (typeof idFactory !== "function") throw new TypeError("An ID factory is required to create a POC.");
  const entities = REACT_REST_POSTGRES_TEMPLATE.componentKinds.map((kind) => {
    const definition = getComponentDefinition(kind);
    if (!definition) throw new Error(`POC template requires an unregistered component kind: ${kind}.`);
    return {
      id: idFactory("entity"),
      kind,
      name: definition.label,
      properties: defaultProperties(definition),
      createdAt: new Date().toISOString(),
    };
  });

  const byKind = new Map(entities.map((entity) => [entity.kind, entity]));
  const relationSpecs = [
    { kind: "calls", source: "frontend.react-app", target: "backend.rest-service" },
    { kind: "reads", source: "backend.rest-service", target: "data.postgresql-database" },
  ];
  const relations = relationSpecs.map((spec) => {
    const sourceEntity = byKind.get(spec.source);
    const targetEntity = byKind.get(spec.target);
    const validation = validateRelationEndpoints(spec.kind, sourceEntity, targetEntity);
    if (!validation.valid) throw new Error(`Invalid POC template relationship: ${validation.reason}`);
    return createWorkbenchRelation({
      id: idFactory("relation"),
      kind: spec.kind,
      sourceEntity,
      targetEntity,
      viewId: "system",
    });
  });

  const next = {
    ...structuredClone(workbench),
    modelRevision: (Number.isSafeInteger(workbench.modelRevision) ? workbench.modelRevision : 0) + 1,
    entities,
    relations,
    pocTemplate: { id: REACT_REST_POSTGRES_TEMPLATE.id, version: REACT_REST_POSTGRES_TEMPLATE.version },
  };
  next.simulationProfile = createIllustrativeSimulationProfile(next, { durationMs, seed });
  return next;
}

function nodePlacement(entity, x, y, idFactory) {
  const definition = getComponentDefinition(entity.kind);
  if (!definition) throw new Error(`POC template contains an unknown component kind: ${entity.kind}.`);
  const width = 280;
  const height = 120;
  const groupId = idFactory("workbench-poc-group");
  return {
    entity,
    x,
    y,
    width,
    height,
    groupId,
    elements: [
      {
        type: "rectangle", x, y, width, height,
        strokeColor: definition.stroke,
        backgroundColor: definition.fill,
        fillStyle: "solid", strokeWidth: 2, roughness: 0,
        roundness: { type: 3 }, groupIds: [groupId],
        customData: { workbench: { entityId: entity.id, viewId: "system", role: "container" } },
      },
      {
        type: "text", x: x + 18, y: y + 25, width: width - 36,
        text: entity.name, fontSize: 20, fontFamily: 1,
        strokeColor: "#20232a", groupIds: [groupId],
        customData: { workbench: { entityId: entity.id, viewId: "system", role: "label" } },
      },
    ],
  };
}

/**
 * Produce Excalidraw-compatible descriptors for the same canonical entities
 * and relations. The controller converts and commits them with one updateScene.
 */
export function buildReactRestPostgresPocSceneDescriptors({ workbench, x, y, idFactory } = {}) {
  if (!workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    throw new TypeError("A POC Workbench model is required to create its scene.");
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || typeof idFactory !== "function") {
    throw new TypeError("Finite scene coordinates and an ID factory are required.");
  }
  const expectedKinds = REACT_REST_POSTGRES_TEMPLATE.componentKinds;
  const byKind = new Map(expectedKinds.map((kind) => [kind, workbench.entities.filter((entity) => entity.kind === kind)]));
  for (const [kind, matches] of byKind) {
    if (matches.length !== 1) throw new Error(`POC scene requires exactly one ${getComponentDefinition(kind)?.label || kind}.`);
  }
  const placements = [
    nodePlacement(byKind.get("frontend.react-app")[0], x, y, idFactory),
    nodePlacement(byKind.get("backend.rest-service")[0], x + 420, y, idFactory),
    nodePlacement(byKind.get("data.postgresql-database")[0], x + 840, y, idFactory),
  ];
  const placementByEntityId = new Map(placements.map((placement) => [placement.entity.id, placement]));
  const relationByKey = new Map(workbench.relations.map((relation) => [`${relation.kind}:${relation.sourceId}:${relation.targetId}`, relation]));
  const routeSpecs = [
    { kind: "calls", sourceKind: "frontend.react-app", targetKind: "backend.rest-service" },
    { kind: "reads", sourceKind: "backend.rest-service", targetKind: "data.postgresql-database" },
  ];
  const arrows = routeSpecs.map((spec) => {
    const source = byKind.get(spec.sourceKind)[0];
    const target = byKind.get(spec.targetKind)[0];
    const relation = relationByKey.get(`${spec.kind}:${source.id}:${target.id}`);
    if (!relation) throw new Error(`POC scene is missing the typed ${spec.kind} relationship.`);
    const sourcePlacement = placementByEntityId.get(source.id);
    const targetPlacement = placementByEntityId.get(target.id);
    const startX = sourcePlacement.x + sourcePlacement.width;
    const endX = targetPlacement.x;
    const centerY = y + sourcePlacement.height / 2;
    const width = endX - startX;
    return {
      type: "arrow", x: startX, y: centerY, width, height: 1,
      points: [[0, 0], [width, 0]],
      strokeColor: "#d4d4d8", strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
      customData: { workbench: { relationId: relation.id, viewId: "system", role: "relation", kind: relation.kind } },
    };
  });
  return [...arrows, ...placements.flatMap((placement) => placement.elements)];
}
