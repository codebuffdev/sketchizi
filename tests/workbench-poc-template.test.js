import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchExtension, readWorkbenchDocument, withWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";
import { WORKBENCH_VIEWS } from "../src/features/workbench/workbenchRegistry.js";
import { addMissingReactRestPostgresPocArtifacts, buildReactRestPostgresArtifactScaffoldingSceneDescriptors, buildReactRestPostgresPocSceneDescriptors, createReactRestPostgresPoc, REACT_REST_POSTGRES_TEMPLATE } from "../src/features/workbench/workbenchPocTemplate.js";
import { generateOpenApiArtifact, generateSqlArtifact } from "../src/features/workbench/workbenchArtifacts.js";
import { validateWorkbench } from "../src/features/workbench/workbenchValidation.js";
import { markSimulationAssumptionsConfirmed } from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";

const REACT_REST_POSTGRES_RUNTIME_KINDS = REACT_REST_POSTGRES_TEMPLATE.runtimeComponentKinds;

function emptyWorkbench() {
  const views = WORKBENCH_VIEWS.map(({ id, label, description }) => ({ id, label, description }));
  const viewScenes = Object.fromEntries(views.filter((view) => view.id !== "system").map((view) => [view.id, { elements: [], appState: {}, files: {} }]));
  return createWorkbenchExtension({ activeViewId: "system", views, entities: [], relations: [], viewScenes, modelRevision: 0 });
}

function idFactory() {
  let index = 0;
  return (prefix) => `${prefix}-test-${++index}`;
}

function makePoc() {
  return createReactRestPostgresPoc({ workbench: emptyWorkbench(), idFactory: idFactory() });
}

test("template creates three runtime components plus a starter API contract and SQL table, with four typed relationships", () => {
  const workbench = makePoc();
  assert.equal(workbench.entities.length, 5);
  assert.deepEqual(workbench.entities.map((entity) => entity.kind), ["frontend.react-app", "backend.rest-service", "data.postgresql-database", "backend.api-endpoint", "data.postgresql-table"]);
  assert.equal(workbench.relations.length, 4);
  const byKind = new Map(workbench.entities.map((entity) => [entity.kind, entity]));
  assert.deepEqual(workbench.relations.map(({ kind, sourceId, targetId }) => ({ kind, sourceId, targetId })), [
    { kind: "calls", sourceId: byKind.get("frontend.react-app").id, targetId: byKind.get("backend.rest-service").id },
    { kind: "reads", sourceId: byKind.get("backend.rest-service").id, targetId: byKind.get("data.postgresql-database").id },
    { kind: "exposes", sourceId: byKind.get("backend.rest-service").id, targetId: byKind.get("backend.api-endpoint").id },
    { kind: "contains-table", sourceId: byKind.get("data.postgresql-database").id, targetId: byKind.get("data.postgresql-table").id },
  ]);
  assert.equal(byKind.get("backend.api-endpoint").properties.path, "/api/items");
  assert.equal(byKind.get("backend.api-endpoint").properties.operationId, "listItems");
  assert.equal(byKind.get("data.postgresql-table").properties.tableName, "items");
  assert.equal(JSON.parse(byKind.get("data.postgresql-table").properties.columns).length, 3);
  assert.equal(workbench.modelRevision, 1);
  assert.deepEqual(workbench.pocTemplate, { id: "react-rest-postgresql", version: 2 });
  assert.equal(workbench.simulationProfile.schemaVersion, 1);
  assert.deepEqual(workbench.simulationProfile.defaultScenario, { durationMs: 15000, seed: 211 });
  assert.deepEqual(Object.keys(workbench.simulationProfile.profilesByEntityId).sort(), workbench.entities.filter((entity) => REACT_REST_POSTGRES_RUNTIME_KINDS.includes(entity.kind)).map((entity) => entity.id).sort());
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("frontend.react-app").id].parameters.trafficRps, 50);
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("backend.rest-service").id].parameters.concurrency, 8);
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("data.postgresql-database").id].parameters.readFraction, 0.9);
  for (const profile of Object.values(workbench.simulationProfile.profilesByEntityId)) {
    assert.ok(Object.values(profile.assumptions).every((assumption) => assumption.status === "proposed"), "users must explicitly confirm synthetic assumptions");
  }
  assert.deepEqual(validateWorkbench(workbench).filter((finding) => finding.severity === "error"), []);
});

test("scene descriptors link all four canvas arrows to canonical relation IDs", () => {
  const workbench = makePoc();
  const descriptors = buildReactRestPostgresPocSceneDescriptors({ workbench, x: -500, y: 100, idFactory: idFactory() });
  assert.equal(descriptors.length, 14, "four typed arrows plus a rectangle and label for each of five components");
  const arrows = descriptors.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 4);
  assert.deepEqual(new Set(arrows.map((element) => element.customData.workbench.relationId)), new Set(workbench.relations.map((relation) => relation.id)));
  assert.ok(arrows.every((element) => element.customData.workbench.role === "relation" && element.customData.workbench.viewId === "system"));
  const containers = descriptors.filter((element) => element.type === "rectangle");
  assert.equal(containers.length, 5);
  assert.deepEqual(new Set(containers.map((element) => element.customData.workbench.entityId)), new Set(workbench.entities.map((entity) => entity.id)));
});

test("typed POC relationships, connector references, profiles and template marker survive document round-trip", () => {
  const workbench = makePoc();
  const descriptors = buildReactRestPostgresPocSceneDescriptors({ workbench, x: 0, y: 0, idFactory: idFactory() });
  const extensions = withWorkbenchExtension({ "com.example.preserved": { keep: true } }, workbench);
  const restored = readWorkbenchDocument({ elements: descriptors, appState: {}, files: {}, extensions }).workbench;
  assert.deepEqual(restored.relations, workbench.relations);
  assert.deepEqual(restored.simulationProfile, workbench.simulationProfile);
  assert.deepEqual(restored.pocTemplate, workbench.pocTemplate);
  assert.deepEqual(extensions["com.example.preserved"], { keep: true });
  assert.equal(extensions["com.sketchizi.workbench"].pocTemplate.id, "react-rest-postgresql");
  const connectors = restored && descriptors.filter((element) => element.type === "arrow");
  assert.deepEqual(new Set(connectors.map((element) => element.customData.workbench.relationId)), new Set(restored.relations.map((relation) => relation.id)));
});

test("template refuses to overwrite an existing semantic model or run outside System view", () => {
  const existing = emptyWorkbench();
  existing.entities.push({ id: "existing", kind: "frontend.react-app", name: "Existing", properties: {} });
  assert.throws(() => createReactRestPostgresPoc({ workbench: existing, idFactory: idFactory() }), /no semantic components yet/);
  const wrongView = emptyWorkbench();
  wrongView.activeViewId = "apis";
  assert.throws(() => createReactRestPostgresPoc({ workbench: wrongView, idFactory: idFactory() }), /System view/);
});

test("template's explicit profile can run baseline, traffic surge and PostgreSQL outage without repairing links manually", () => {
  const workbench = makePoc();
  const simulationProfile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const suite = runWorkbenchExperiments({ workbench, simulationProfile });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics));
  assert.deepEqual(Object.keys(suite.runs), ["baseline", "trafficSurge", "outage"]);
  assert.ok(Object.values(suite.runs).every((run) => run.result.status === "completed"));
  assert.equal(suite.projection.topology.nodes.length, 3, "API endpoint and table are contract/schema metadata, not extra runtime nodes");
  assert.equal(suite.projection.topology.edges.length, 2);
  assert.equal(suite.runs.outage.targetEntityId, workbench.entities.find((entity) => entity.kind === "data.postgresql-database").id);
  assert.ok(suite.runs.baseline.result.result.metrics.offeredRequests > 0);
  assert.equal(suite.runs.outage.result.result.metrics.successRate, 0);
});


test("POC includes valid starter artifacts without manual endpoint or table setup", () => {
  const workbench = makePoc();
  const openapi = generateOpenApiArtifact(workbench);
  const sql = generateSqlArtifact(workbench);
  assert.equal(openapi.ok, true, JSON.stringify(openapi.errors));
  assert.equal(sql.ok, true, JSON.stringify(sql.errors));
  assert.equal(JSON.parse(openapi.text).paths["/api/items"].get.operationId, "listItems");
  assert.match(sql.text, /CREATE TABLE IF NOT EXISTS "public"\."items"/);
  assert.match(sql.text, /"created_at" TIMESTAMPTZ NOT NULL/);
});


test("older three-component POC can add artifact scaffolding without replacing runtime components", () => {
  const ids = idFactory();
  const oldPoc = createReactRestPostgresPoc({ workbench: emptyWorkbench(), idFactory: ids });
  const keepEntities = oldPoc.entities.filter((entity) => REACT_REST_POSTGRES_RUNTIME_KINDS.includes(entity.kind));
  const keepIds = new Set(keepEntities.map((entity) => entity.id));
  oldPoc.entities = keepEntities;
  oldPoc.relations = oldPoc.relations.filter((relation) => ["calls", "reads"].includes(relation.kind));
  oldPoc.pocTemplate = { id: "react-rest-postgresql", version: 1 };
  oldPoc.modelRevision = 4;
  const beforeProfile = structuredClone(oldPoc.simulationProfile);
  const result = addMissingReactRestPostgresPocArtifacts({ workbench: oldPoc, idFactory: ids });
  assert.equal(result.changed, true);
  assert.equal(result.workbench.entities.length, 5);
  assert.equal(result.workbench.relations.length, 4);
  assert.deepEqual(new Set(result.workbench.entities.filter((entity) => REACT_REST_POSTGRES_RUNTIME_KINDS.includes(entity.kind)).map((entity) => entity.id)), keepIds);
  assert.deepEqual(result.workbench.simulationProfile.profilesByEntityId, beforeProfile.profilesByEntityId);
  assert.equal(result.workbench.modelRevision, 5);
  assert.equal(result.workbench.pocTemplate.version, REACT_REST_POSTGRES_TEMPLATE.version);

  const service = result.workbench.entities.find((entity) => entity.kind === "backend.rest-service");
  const database = result.workbench.entities.find((entity) => entity.kind === "data.postgresql-database");
  const existingPlacements = {
    [service.id]: { x: 420, y: 100, width: 280, height: 120 },
    [database.id]: { x: 840, y: 100, width: 280, height: 120 },
  };
  const existingRelationIds = result.workbench.relations.filter((relation) => ["calls", "reads"].includes(relation.kind)).map((relation) => relation.id);
  const descriptors = buildReactRestPostgresArtifactScaffoldingSceneDescriptors({
    workbench: result.workbench, existingPlacements, existingRelationIds, idFactory: ids,
  });
  assert.equal(descriptors.filter((element) => element.type === "rectangle").length, 2);
  assert.equal(descriptors.filter((element) => element.type === "arrow").length, 2);
  assert.deepEqual(new Set(descriptors.filter((element) => element.type === "arrow").map((element) => element.customData.workbench.kind)), new Set(["exposes", "contains-table"]));

  assert.equal(generateOpenApiArtifact(result.workbench).ok, true);
  assert.equal(generateSqlArtifact(result.workbench).ok, true);
  const confirmed = markSimulationAssumptionsConfirmed(result.workbench.simulationProfile);
  const suite = runWorkbenchExperiments({ workbench: result.workbench, simulationProfile: confirmed });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics));
  assert.equal(suite.projection.topology.nodes.length, 3);
  assert.equal(suite.projection.topology.edges.length, 2);
  const repeated = addMissingReactRestPostgresPocArtifacts({ workbench: result.workbench, idFactory: ids });
  assert.equal(repeated.changed, false, "the upgrade must be idempotent");
});
