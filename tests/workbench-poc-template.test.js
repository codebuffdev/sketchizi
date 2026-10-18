import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchExtension, readWorkbenchDocument, withWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";
import { WORKBENCH_VIEWS } from "../src/features/workbench/workbenchRegistry.js";
import { buildReactRestPostgresPocSceneDescriptors, createReactRestPostgresPoc } from "../src/features/workbench/workbenchPocTemplate.js";
import { validateWorkbench } from "../src/features/workbench/workbenchValidation.js";
import { markSimulationAssumptionsConfirmed } from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";

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

test("template creates three canonical components, two valid typed relationships and explicit profiles", () => {
  const workbench = makePoc();
  assert.equal(workbench.entities.length, 3);
  assert.deepEqual(workbench.entities.map((entity) => entity.kind), ["frontend.react-app", "backend.rest-service", "data.postgresql-database"]);
  assert.equal(workbench.relations.length, 2);
  const byKind = new Map(workbench.entities.map((entity) => [entity.kind, entity]));
  assert.deepEqual(workbench.relations.map(({ kind, sourceId, targetId }) => ({ kind, sourceId, targetId })), [
    { kind: "calls", sourceId: byKind.get("frontend.react-app").id, targetId: byKind.get("backend.rest-service").id },
    { kind: "reads", sourceId: byKind.get("backend.rest-service").id, targetId: byKind.get("data.postgresql-database").id },
  ]);
  assert.equal(workbench.modelRevision, 1);
  assert.deepEqual(workbench.pocTemplate, { id: "react-rest-postgresql", version: 1 });
  assert.equal(workbench.simulationProfile.schemaVersion, 1);
  assert.deepEqual(workbench.simulationProfile.defaultScenario, { durationMs: 15000, seed: 211 });
  assert.deepEqual(Object.keys(workbench.simulationProfile.profilesByEntityId).sort(), workbench.entities.map((entity) => entity.id).sort());
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("frontend.react-app").id].parameters.trafficRps, 50);
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("backend.rest-service").id].parameters.concurrency, 8);
  assert.equal(workbench.simulationProfile.profilesByEntityId[byKind.get("data.postgresql-database").id].parameters.readFraction, 0.9);
  for (const profile of Object.values(workbench.simulationProfile.profilesByEntityId)) {
    assert.ok(Object.values(profile.assumptions).every((assumption) => assumption.status === "proposed"), "users must explicitly confirm synthetic assumptions");
  }
  assert.deepEqual(validateWorkbench(workbench).filter((finding) => finding.severity === "error"), []);
});

test("scene descriptors link exactly two canvas arrows to canonical relation IDs", () => {
  const workbench = makePoc();
  const descriptors = buildReactRestPostgresPocSceneDescriptors({ workbench, x: -500, y: 100, idFactory: idFactory() });
  assert.equal(descriptors.length, 8, "two arrows plus a rectangle and label for each of three components");
  const arrows = descriptors.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 2);
  assert.deepEqual(new Set(arrows.map((element) => element.customData.workbench.relationId)), new Set(workbench.relations.map((relation) => relation.id)));
  assert.ok(arrows.every((element) => element.customData.workbench.role === "relation" && element.customData.workbench.viewId === "system"));
  const containers = descriptors.filter((element) => element.type === "rectangle");
  assert.equal(containers.length, 3);
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
  assert.equal(suite.projection.topology.nodes.length, 3);
  assert.equal(suite.projection.topology.edges.length, 2);
  assert.equal(suite.runs.outage.targetEntityId, workbench.entities.find((entity) => entity.kind === "data.postgresql-database").id);
  assert.ok(suite.runs.baseline.result.result.metrics.offeredRequests > 0);
  assert.equal(suite.runs.outage.result.result.metrics.successRate, 0);
});
