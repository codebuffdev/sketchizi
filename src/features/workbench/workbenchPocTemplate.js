import { createIllustrativeSimulationProfile } from "../simulation/experiments/simulationExperimentModel.js";
import { createWorkbenchRelation, getComponentDefinition, validateRelationEndpoints } from "./workbenchModel.js";

export const REACT_REST_POSTGRES_TEMPLATE = Object.freeze({
  id: "react-rest-postgresql",
  version: 2,
  name: "Web application with database",
  description: "A preconfigured full-stack request path with typed connections and editable synthetic experiment profiles.",
  componentKinds: ["frontend.react-app", "backend.rest-service", "data.postgresql-database", "backend.api-endpoint", "data.postgresql-table"],
  runtimeComponentKinds: ["frontend.react-app", "backend.rest-service", "data.postgresql-database"],
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

function createStarterEntity(kind, idFactory) {
  const definition = getComponentDefinition(kind);
  if (!definition) throw new Error(`POC template requires an unregistered component kind: ${kind}.`);
  const entity = {
    id: idFactory("entity"),
    kind,
    name: definition.label,
    properties: defaultProperties(definition),
    createdAt: new Date().toISOString(),
  };
  if (kind === "backend.api-endpoint") {
    entity.name = "List items";
    entity.properties = {
      ...entity.properties,
      method: "GET",
      path: "/api/items",
      operationId: "listItems",
      summary: "List items",
      responseSchema: JSON.stringify({
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
          required: ["id", "name"],
        },
      }, null, 2),
    };
  }
  if (kind === "data.postgresql-table") {
    entity.name = "items";
    entity.properties = {
      ...entity.properties,
      tableName: "items",
      indexes: "[]",
      columns: JSON.stringify([
        { name: "id", type: "UUID", primaryKey: true, nullable: false },
        { name: "name", type: "TEXT", nullable: false },
        { name: "created_at", type: "TIMESTAMPTZ", nullable: false },
      ], null, 2),
    };
  }
  return entity;
}

/**
 * Create the canonical semantic model and profiles for the full-stack POC.
 * Scene elements are created separately by the controller, so a caller can
 * build and validate everything before committing one canvas/document update.
 */
export function createReactRestPostgresPoc({ workbench, idFactory, durationMs = 15000, seed = 211 } = {}) {
  requireModel(workbench);
  if (typeof idFactory !== "function") throw new TypeError("An ID factory is required to create a POC.");
  const entities = REACT_REST_POSTGRES_TEMPLATE.componentKinds.map((kind) => createStarterEntity(kind, idFactory));

  const byKind = new Map(entities.map((entity) => [entity.kind, entity]));
  const relationSpecs = [
    { kind: "calls", source: "frontend.react-app", target: "backend.rest-service" },
    { kind: "reads", source: "backend.rest-service", target: "data.postgresql-database" },
    { kind: "exposes", source: "backend.rest-service", target: "backend.api-endpoint" },
    { kind: "contains-table", source: "data.postgresql-database", target: "data.postgresql-table" },
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

/**
 * Upgrade an older three-runtime-component POC in place with the starter API
 * contract and SQL table. Existing entities and relationships are preserved.
 */
export function addMissingReactRestPostgresPocArtifacts({ workbench, idFactory } = {}) {
  if (!workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    throw new TypeError("A Workbench model is required to add starter artifacts.");
  }
  if (workbench.pocTemplate?.id !== REACT_REST_POSTGRES_TEMPLATE.id) {
    throw new Error("Starter artifacts can only be added to a React + REST + PostgreSQL POC template.");
  }
  if (workbench.activeViewId !== "system") {
    throw new Error("Switch to the System view before adding starter artifacts.");
  }
  if (typeof idFactory !== "function") throw new TypeError("An ID factory is required to add starter artifacts.");

  const next = structuredClone(workbench);
  const addedEntities = [];
  const addedRelations = [];
  const exactlyOne = (kind, label) => {
    const matches = next.entities.filter((entity) => entity.kind === kind);
    if (matches.length !== 1) throw new Error(`Cannot safely add starter artifacts: expected exactly one ${label}, found ${matches.length}.`);
    return matches[0];
  };
  const service = exactlyOne("backend.rest-service", "REST service");
  const database = exactlyOne("data.postgresql-database", "PostgreSQL database");

  const upsertEntity = (kind, label) => {
    let matches = next.entities.filter((entity) => entity.kind === kind);
    if (matches.length > 1) throw new Error(`Cannot safely choose a ${label}: the POC already contains multiple candidates.`);
    if (matches.length === 0) {
      const entity = createStarterEntity(kind, idFactory);
      next.entities.push(entity);
      addedEntities.push(entity);
      matches = [entity];
    }
    return matches[0];
  };
  const endpoint = upsertEntity("backend.api-endpoint", "API endpoint");
  const table = upsertEntity("data.postgresql-table", "PostgreSQL table");
  const ensureRelation = (kind, sourceEntity, targetEntity) => {
    const matches = next.relations.filter((relation) => relation.kind === kind && relation.targetId === targetEntity.id);
    if (matches.length > 1) throw new Error(`Cannot safely repair ${kind}: the target has multiple matching relationships.`);
    if (matches.length === 1) {
      if (matches[0].sourceId !== sourceEntity.id) throw new Error(`Cannot safely repair ${kind}: ${targetEntity.name} is already connected to a different source.`);
      return;
    }
    const relation = createWorkbenchRelation({ id: idFactory("relation"), kind, sourceEntity, targetEntity, viewId: "system" });
    next.relations.push(relation);
    addedRelations.push(relation);
  };
  ensureRelation("exposes", service, endpoint);
  ensureRelation("contains-table", database, table);

  if (addedEntities.length === 0 && addedRelations.length === 0) {
    return { workbench, addedEntities, addedRelations, changed: false };
  }
  next.modelRevision = (Number.isSafeInteger(workbench.modelRevision) ? workbench.modelRevision : 0) + 1;
  next.pocTemplate = { id: REACT_REST_POSTGRES_TEMPLATE.id, version: REACT_REST_POSTGRES_TEMPLATE.version };
  if (!next.simulationProfile) {
    next.simulationProfile = createIllustrativeSimulationProfile(next);
  } else {
    next.simulationProfile = structuredClone(next.simulationProfile);
    next.simulationProfile.sourceModelRevision = next.modelRevision;
  }
  return { workbench: next, addedEntities, addedRelations, changed: true };
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
    nodePlacement(byKind.get("backend.api-endpoint")[0], x + 420, y + 200, idFactory),
    nodePlacement(byKind.get("data.postgresql-table")[0], x + 840, y + 200, idFactory),
  ];
  const placementByEntityId = new Map(placements.map((placement) => [placement.entity.id, placement]));
  const relationByKey = new Map(workbench.relations.map((relation) => [`${relation.kind}:${relation.sourceId}:${relation.targetId}`, relation]));
  const routeSpecs = [
    { kind: "calls", sourceKind: "frontend.react-app", targetKind: "backend.rest-service", sourceSide: "right", targetSide: "left" },
    { kind: "reads", sourceKind: "backend.rest-service", targetKind: "data.postgresql-database", sourceSide: "right", targetSide: "left" },
    { kind: "exposes", sourceKind: "backend.rest-service", targetKind: "backend.api-endpoint", sourceSide: "bottom", targetSide: "top" },
    { kind: "contains-table", sourceKind: "data.postgresql-database", targetKind: "data.postgresql-table", sourceSide: "bottom", targetSide: "top" },
  ];
  const arrows = routeSpecs.map((spec) => {
    const source = byKind.get(spec.sourceKind)[0];
    const target = byKind.get(spec.targetKind)[0];
    const relation = relationByKey.get(`${spec.kind}:${source.id}:${target.id}`);
    if (!relation) throw new Error(`POC scene is missing the typed ${spec.kind} relationship.`);
    const sourcePlacement = placementByEntityId.get(source.id);
    const targetPlacement = placementByEntityId.get(target.id);
    const anchor = (placement, side) => {
      if (side === "right") return { x: placement.x + placement.width, y: placement.y + placement.height / 2 };
      if (side === "left") return { x: placement.x, y: placement.y + placement.height / 2 };
      if (side === "bottom") return { x: placement.x + placement.width / 2, y: placement.y + placement.height };
      return { x: placement.x + placement.width / 2, y: placement.y };
    };
    const start = anchor(sourcePlacement, spec.sourceSide);
    const finish = anchor(targetPlacement, spec.targetSide);
    const dx = finish.x - start.x;
    const dy = finish.y - start.y;
    // Excalidraw expects positive dimensions for this descriptor. The endpoints
    // are chosen so these template connectors always proceed rightward/downward.
    const width = Math.max(1, dx);
    const height = Math.max(1, dy);
    return {
      type: "arrow", x: start.x, y: start.y, width, height,
      points: [[0, 0], [dx, dy]],
      strokeColor: "#d4d4d8", strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
      customData: { workbench: { relationId: relation.id, viewId: "system", role: "relation", kind: relation.kind } },
    };
  });
  return [...arrows, ...placements.flatMap((placement) => placement.elements)];
}


/**
 * Render missing starter endpoint/table placements and their semantic connectors
 * into an older POC's active System scene. The supplied placement map is derived
 * from live Excalidraw container elements, so the helper does not guess positions
 * for components that already exist in the canvas.
 */
export function buildReactRestPostgresArtifactScaffoldingSceneDescriptors({
  workbench, existingPlacements = {}, existingRelationIds = [], idFactory,
} = {}) {
  if (!workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    throw new TypeError("A POC Workbench model is required to add artifact scaffolding to the scene.");
  }
  if (typeof idFactory !== "function") throw new TypeError("An ID factory is required to build artifact scene descriptors.");
  const byKind = (kind) => {
    const matches = workbench.entities.filter((entity) => entity.kind === kind);
    if (matches.length !== 1) throw new Error(`Artifact scaffolding requires exactly one ${getComponentDefinition(kind)?.label || kind}.`);
    return matches[0];
  };
  const service = byKind("backend.rest-service");
  const database = byKind("data.postgresql-database");
  const endpoint = byKind("backend.api-endpoint");
  const table = byKind("data.postgresql-table");
  const placementByEntityId = new Map(Object.entries(existingPlacements).map(([id, placement]) => [id, { entity: workbench.entities.find((entity) => entity.id === id), ...placement }]));
  const descriptors = [];
  const makeIfMissing = (entity, relatedPlacement, layout) => {
    if (placementByEntityId.has(entity.id)) return;
    if (!relatedPlacement) throw new Error(`Cannot place ${entity.name}: its related component is not present in the active System view.`);
    const width = 280;
    const height = 120;
    let x = layout.x(relatedPlacement);
    let y = layout.y(relatedPlacement);
    const collides = (candidateX, candidateY) => [...placementByEntityId.values()].some((placed) =>
      candidateX < placed.x + placed.width + 40
      && candidateX + width + 40 > placed.x
      && candidateY < placed.y + placed.height + 40
      && candidateY + height + 40 > placed.y);
    if (collides(x, y) && layout.fallback) {
      x = layout.fallback.x(relatedPlacement);
      y = layout.fallback.y(relatedPlacement);
    }
    if (collides(x, y)) throw new Error(`Cannot place ${entity.name} without overlapping another component in the active System view.`);
    const placement = nodePlacement(entity, x, y, idFactory);
    placementByEntityId.set(entity.id, placement);
    descriptors.push(...placement.elements);
  };
  const servicePlacement = placementByEntityId.get(service.id);
  const databasePlacement = placementByEntityId.get(database.id);
  makeIfMissing(endpoint, servicePlacement, {
    x: (placement) => placement.x + placement.width + 80,
    y: (placement) => placement.y,
    fallback: { x: (placement) => placement.x, y: (placement) => placement.y + placement.height + 80 },
  });
  makeIfMissing(table, databasePlacement, {
    x: (placement) => placement.x,
    y: (placement) => placement.y + placement.height + 80,
  });

  const existingRelations = new Set(existingRelationIds);
  const endpointPlacement = placementByEntityId.get(endpoint.id);
  const exposesVertical = endpointPlacement.y >= servicePlacement.y + servicePlacement.height;
  const relationSpecs = [
    { kind: "exposes", source: service, target: endpoint, sourceSide: exposesVertical ? "bottom" : "right", targetSide: exposesVertical ? "top" : "left" },
    { kind: "contains-table", source: database, target: table, sourceSide: "bottom", targetSide: "top" },
  ];
  const anchor = (placement, side) => {
    if (side === "right") return { x: placement.x + placement.width, y: placement.y + placement.height / 2 };
    if (side === "left") return { x: placement.x, y: placement.y + placement.height / 2 };
    if (side === "bottom") return { x: placement.x + placement.width / 2, y: placement.y + placement.height };
    return { x: placement.x + placement.width / 2, y: placement.y };
  };
  for (const spec of relationSpecs) {
    const relation = workbench.relations.find((item) => item.kind === spec.kind && item.sourceId === spec.source.id && item.targetId === spec.target.id);
    if (!relation) throw new Error(`Artifact scaffolding is missing the ${spec.kind} semantic relationship.`);
    if (existingRelations.has(relation.id)) continue;
    const sourcePlacement = placementByEntityId.get(spec.source.id);
    const targetPlacement = placementByEntityId.get(spec.target.id);
    const start = anchor(sourcePlacement, spec.sourceSide);
    const finish = anchor(targetPlacement, spec.targetSide);
    const dx = finish.x - start.x;
    const dy = finish.y - start.y;
    descriptors.push({
      type: "arrow", x: start.x, y: start.y, width: Math.max(1, dx), height: Math.max(1, dy),
      points: [[0, 0], [dx, dy]],
      strokeColor: "#d4d4d8", strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
      customData: { workbench: { relationId: relation.id, viewId: "system", role: "relation", kind: relation.kind } },
    });
  }
  return descriptors;
}
