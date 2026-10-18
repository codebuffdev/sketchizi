import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulationProjection } from "../src/features/simulation/adapter/buildSimulationProjection.js";
import { runSimulation } from "../src/features/simulation/engine/runSimulation.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";
import {
  compareSimulationRuns,
  chooseCapacityImprovementScenarioKey,
  getCapacityPressureRows,
  buildScenarioComparisonOverview,
  createCapacityImprovementProfile,
  createIllustrativeSimulationProfile,
  explainSimulationRun,
  markSimulationAssumptionsConfirmed,
  mergeMissingIllustrativeProfiles,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, properties: {} });
const workbench = () => ({
  schemaVersion: 1,
  modelRevision: 7,
  activeViewId: "system",
  views: [{ id: "system", label: "System" }, { id: "data", label: "Data" }],
  viewScenes: {},
  entities: [
    entity("web", "frontend.react-app", "Web client"),
    entity("api", "backend.rest-service", "Checkout API"),
    entity("endpoint", "backend.api-endpoint", "Create checkout", { method: "POST", path: "/checkout" }),
    entity("db", "data.postgresql-database", "Checkout PostgreSQL"),
  ],
  relations: [
    relation("web-calls-endpoint", "calls", "web", "endpoint"),
    relation("api-exposes-endpoint", "exposes", "api", "endpoint"),
    relation("api-reads-db", "reads", "api", "db"),
    relation("api-writes-db", "writes", "api", "db"),
  ],
});

function runPair() {
  const model = workbench();
  const proposed = createIllustrativeSimulationProfile(model);
  const confirmed = markSimulationAssumptionsConfirmed(proposed);
  const projection = buildSimulationProjection({ workbench: model, simulationProfile: confirmed });
  assert.equal(projection.status, "ready", JSON.stringify(projection.diagnostics, null, 2));
  const baseline = runSimulation({ projection });
  const surge = runSimulation({ projection, scenarioOverrides: { trafficMultiplier: 5 } });
  return { model, proposed, confirmed, projection, baseline, surge };
}

test("creates proposed profiles only for supported synchronous runtime components", () => {
  const model = workbench();
  model.entities.push(entity("queue", "messaging.queue", "Jobs"));
  const profile = createIllustrativeSimulationProfile(model);
  assert.deepEqual(Object.keys(profile.profilesByEntityId).sort(), ["api", "db", "web"]);
  assert.equal(profile.profilesByEntityId.api.assumptions.meanServiceMs.status, "proposed");
  assert.equal(profile.defaultScenario.durationMs, 15000);
  assert.equal(profile.defaultScenario.seed, 211);
});

test("requires explicit assumption confirmation before the projection can run", () => {
  const model = workbench();
  const proposed = createIllustrativeSimulationProfile(model);
  const blocked = buildSimulationProjection({ workbench: model, simulationProfile: proposed });
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.diagnostics.some((item) => item.code === "SIM-ASSUMPTION-UNCONFIRMED"));
  const confirmed = markSimulationAssumptionsConfirmed(proposed);
  assert.ok(Object.values(confirmed.profilesByEntityId).every((entry) => Object.values(entry.assumptions).every((value) => value.status === "user-confirmed")));
  assert.equal(buildSimulationProjection({ workbench: model, simulationProfile: confirmed }).status, "ready");
});

test("merges profiles for new supported components without overwriting existing edited values", () => {
  const originalModel = workbench();
  const profile = createIllustrativeSimulationProfile(originalModel);
  profile.profilesByEntityId.api.parameters.meanServiceMs = 42;
  const changedModel = workbench();
  changedModel.entities.push(entity("api2", "backend.rest-service", "Admin API"));
  const merged = mergeMissingIllustrativeProfiles(changedModel, profile);
  assert.deepEqual(merged.addedEntityIds, ["api2"]);
  assert.equal(merged.profile.profilesByEntityId.api.parameters.meanServiceMs, 42);
  assert.equal(merged.profile.profilesByEntityId.api2.parameters.meanServiceMs, 25);
  assert.equal(merged.profile.profilesByEntityId.api2.assumptions.meanServiceMs.status, "proposed");
});


test("capacity improvement targets the most pressured load scenario and never optimizes an outage", () => {
  const runs = {
    baseline: { label: "Baseline", result: { status: "completed", result: { metrics: { droppedRequests: 0, failedRequests: 0, successRate: 1, successfulLatencyMs: { p95: 65 } }, perNode: [{ sourceEntityId: "db", utilization: 0.25, dropped: 0, failed: 0 }] } } },
    trafficSurge: { label: "5× traffic", result: { status: "completed", result: { metrics: { droppedRequests: 810, failedRequests: 0, successRate: 0.789, successfulLatencyMs: { p95: 232 } }, perNode: [{ sourceEntityId: "db", utilization: 0.997, dropped: 810, failed: 0 }] } } },
    outage: { label: "PostgreSQL unavailable", result: { status: "completed", result: { metrics: { droppedRequests: 0, failedRequests: 700, successRate: 0, successfulLatencyMs: { p95: null } }, perNode: [{ sourceEntityId: "db", utilization: 0, dropped: 0, failed: 700 }] } } },
  };
  assert.equal(chooseCapacityImprovementScenarioKey(runs, "baseline"), "trafficSurge");
  assert.equal(chooseCapacityImprovementScenarioKey(runs, "trafficSurge"), "trafficSurge", "an explicitly selected load scenario is respected");
  assert.equal(chooseCapacityImprovementScenarioKey(runs, "outage"), "trafficSurge", "capacity increases do not target an unavailable dependency scenario");
  assert.deepEqual(getCapacityPressureRows(runs.trafficSurge), [{ entityId: "db", hasPressure: true, maxDropped: 810, maxFailed: 0, peakUtilization: 0.997 }]);
});

test("prepares a one-variable capacity improvement using pressure evidence without mutating the base profile", () => {
  const model = workbench();
  const profile = createIllustrativeSimulationProfile(model);
  const original = structuredClone(profile);
  const improvement = createCapacityImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [
      { entityId: "api", hasPressure: true, maxDropped: 3, peakUtilization: 0.9 },
      { entityId: "db", hasPressure: true, maxDropped: 50, peakUtilization: 0.99 },
    ],
  });

  assert.equal(improvement.entityId, "db");
  assert.equal(improvement.field, "concurrency");
  assert.equal(improvement.before, 6);
  assert.equal(improvement.after, 8);
  assert.deepEqual(profile, original, "the current profile remains unchanged");
  assert.equal(improvement.profile.profilesByEntityId.db.parameters.concurrency, 8);
  assert.equal(improvement.profile.profilesByEntityId.api.parameters.concurrency, 8);
  assert.equal(improvement.profile.profilesByEntityId.web.parameters.trafficRps, 50);
  assert.equal(improvement.profile.profilesByEntityId.db.assumptions.concurrency.source, "controlled-debug-experiment-override");

  const changedParameterPaths = [];
  for (const [entityId, entry] of Object.entries(original.profilesByEntityId)) {
    const improvedEntry = improvement.profile.profilesByEntityId[entityId];
    for (const [field, value] of Object.entries(entry.parameters)) {
      if (value !== improvedEntry.parameters[field]) changedParameterPaths.push(`${entityId}.${field}`);
    }
  }
  assert.deepEqual(changedParameterPaths, ["db.concurrency"]);
});

test("one-variable capacity trial compares the same pressured traffic scenario before and after", () => {
  const model = workbench();
  const proposed = createIllustrativeSimulationProfile(model);
  const confirmed = markSimulationAssumptionsConfirmed(proposed);
  const baseSnapshot = structuredClone(confirmed);
  const baseSuite = runWorkbenchExperiments({ workbench: model, simulationProfile: confirmed, trafficMultiplier: 5 });
  assert.equal(baseSuite.status, "completed");

  const scenarioKey = chooseCapacityImprovementScenarioKey(baseSuite.runs, "baseline");
  assert.equal(scenarioKey, "trafficSurge");
  const improvement = createCapacityImprovementProfile({
    profile: confirmed,
    workbench: model,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: getCapacityPressureRows(baseSuite.runs[scenarioKey]),
  });
  assert.equal(improvement.entityId, "db", "capacity is selected from pressure in the stressed scenario");
  const trialSuite = runWorkbenchExperiments({ workbench: model, simulationProfile: improvement.profile, trafficMultiplier: 5 });
  assert.equal(trialSuite.status, "completed");
  assert.equal(trialSuite.runs[scenarioKey].result.status, "completed");
  const comparison = compareSimulationRuns(baseSuite.runs[scenarioKey].result, trialSuite.runs[scenarioKey].result);
  assert.equal(comparison.status, "ready");
  assert.ok(comparison.metrics.some((item) => item.key === "droppedRequests"));
  assert.ok(comparison.metrics.find((item) => item.key === "offeredRequests").before > baseSuite.runs.baseline.result.result.metrics.offeredRequests * 4);
  const dropComparison = comparison.metrics.find((item) => item.key === "droppedRequests");
  const successComparison = comparison.metrics.find((item) => item.key === "successRate");
  assert.ok(dropComparison.after < dropComparison.before || successComparison.after > successComparison.before, "the same stressed workload should reflect the capacity change when it materially changes outcomes");
  assert.deepEqual(confirmed, baseSnapshot, "the base profile used for comparison is unchanged");
  assert.equal(model.modelRevision, 7, "the canonical Workbench model is unchanged");
});

test("capacity improvement skips maxed-out concurrency and refuses when no eligible component remains", () => {
  const model = workbench();
  const profile = createIllustrativeSimulationProfile(model);
  profile.profilesByEntityId.db.parameters.concurrency = 10000;
  const improvement = createCapacityImprovementProfile({ profile, workbench: model, scopeEntityIds: ["api", "db"] });
  assert.equal(improvement.entityId, "api");
  assert.equal(improvement.before, 8);
  assert.equal(improvement.after, 10);
  profile.profilesByEntityId.api.parameters.concurrency = 10000;
  assert.throws(() => createCapacityImprovementProfile({ profile, workbench: model, scopeEntityIds: ["api", "db"] }), /No in-scope runtime component/);
});

test("compares scenario metrics against the baseline with explicit absolute and percentage deltas", () => {
  const { baseline, surge } = runPair();
  const comparison = compareSimulationRuns(baseline, surge);
  assert.equal(comparison.status, "ready");
  const offered = comparison.metrics.find((item) => item.key === "offeredRequests");
  const successRate = comparison.metrics.find((item) => item.key === "successRate");
  assert.ok(offered.after > offered.before);
  assert.equal(offered.delta.absolute, offered.after - offered.before);
  assert.equal(successRate.unit, "ratio");
});

test("explains capacity pressure with a stable link to the source Workbench entity", () => {
  const { model, projection } = runPair();
  const overloaded = runSimulation({ projection, scenarioOverrides: { trafficMultiplier: 5 } });
  const explanations = explainSimulationRun(overloaded, model, { scenarioLabel: "5× traffic" });
  assert.ok(explanations.length > 0);
  const databaseFinding = explanations.find((item) => item.entityIds.includes("db"));
  assert.ok(databaseFinding, JSON.stringify(explanations, null, 2));
  assert.ok(databaseFinding.message.includes("simulated run") || databaseFinding.message.includes("observed utilization"));
});

test("does not invent explanations for blocked simulation runs", () => {
  const model = workbench();
  const explanations = explainSimulationRun({ status: "blocked", result: null }, model);
  assert.deepEqual(explanations, []);
  assert.equal(compareSimulationRuns({ status: "blocked" }, { status: "completed", result: {} }).status, "unavailable");
});


test("builds a cross-scenario overview with component-linked pressure rows and conservative insights", () => {
  const model = workbench();
  const suite = runWorkbenchExperimentsForOverview(model);
  const overview = buildScenarioComparisonOverview(suite, model);
  assert.equal(overview.status, "ready");
  assert.deepEqual(overview.scenarios.map((row) => row.key), ["baseline", "trafficSurge", "outage"]);
  assert.equal(overview.scenarios[0].deltaVsBaseline.droppedRequests, 0);
  assert.ok(overview.scenarios[1].metrics.offeredRequests > overview.scenarios[0].metrics.offeredRequests);
  assert.ok(overview.components.some((row) => row.entityId === "db"));
  assert.ok(overview.components.every((row) => row.byScenario && typeof row.hasPressure === "boolean"));
  assert.ok(overview.insights.every((item) => Array.isArray(item.entityIds) && item.evidence));
});

function runWorkbenchExperimentsForOverview(model) {
  // Import is kept here to avoid making the lower-level fixture depend on UI state.
  return runWorkbenchExperiments({ workbench: model, simulationProfile: markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(model, { durationMs: 10000, seed: 20261017 })) });
}
