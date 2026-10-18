import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
  createServiceTimeImprovementProfile,
  getCapacityPressureRows,
  chooseCapacityImprovementScenarioKey,
  compareSimulationRuns,
  buildTimeSeriesComparisonPoints,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, properties: {} });
const createModel = () => ({
  schemaVersion: 1,
  modelRevision: 7,
  activeViewId: "system",
  views: [{ id: "system", label: "System" }],
  entities: [
    entity("web", "frontend.react-app", "React application"),
    entity("api", "backend.rest-service", "REST service"),
    entity("endpoint", "backend.api-endpoint", "List items", { method: "GET", path: "/api/items" }),
    entity("db", "data.postgresql-database", "PostgreSQL"),
  ],
  relations: [
    relation("web-calls-endpoint", "calls", "web", "endpoint"),
    relation("api-exposes-endpoint", "exposes", "api", "endpoint"),
    relation("api-reads-db", "reads", "api", "db"),
  ],
});

test("service-time trial reduces only meanServiceMs on the evidence-selected component", () => {
  const model = createModel();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(model));
  const original = structuredClone(profile);
  const improvement = createServiceTimeImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [
      { entityId: "api", serviceTimeP95Ms: 40, queueWaitP95Ms: 3, peakUtilization: 0.8 },
      { entityId: "db", serviceTimeP95Ms: 58, queueWaitP95Ms: 20, peakUtilization: 0.99 },
    ],
    preferredEntityId: "api",
  });
  assert.equal(improvement.entityId, "api", "a trace-guided target with service-time evidence is preferred");
  assert.equal(improvement.field, "meanServiceMs");
  assert.equal(improvement.before, 25);
  assert.equal(improvement.after, 20);
  assert.equal(improvement.selectionReason, "selected-trace-service-time-evidence");
  assert.deepEqual(profile, original, "source profile remains unchanged");
  assert.equal(improvement.profile.profilesByEntityId.api.parameters.meanServiceMs, 20);
  assert.equal(improvement.profile.profilesByEntityId.api.parameters.concurrency, original.profilesByEntityId.api.parameters.concurrency);
  assert.equal(improvement.profile.profilesByEntityId.db.parameters.meanServiceMs, original.profilesByEntityId.db.parameters.meanServiceMs);
  assert.match(improvement.profile.profilesByEntityId.api.assumptions.meanServiceMs.note, /controlled experiment only/i);
});

test("service-time trial falls back to the largest recorded service-time p95 and ignores unsupported kinds", () => {
  const model = createModel();
  const profile = createIllustrativeSimulationProfile(model);
  const trial = createServiceTimeImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [
      { entityId: "api", serviceTimeP95Ms: 21, queueWaitP95Ms: 5 },
      { entityId: "db", serviceTimeP95Ms: 45, queueWaitP95Ms: 12 },
      { entityId: "web", serviceTimeP95Ms: 500, queueWaitP95Ms: 0 },
    ],
    preferredEntityId: "unknown",
  });
  assert.equal(trial.entityId, "db");
  assert.equal(trial.selectionReason, "scenario-service-time-evidence");
  assert.equal(trial.before, 30);
  assert.equal(trial.after, 24);
});

test("service-time trial requires recorded per-component service-time evidence", () => {
  const model = createModel();
  const profile = createIllustrativeSimulationProfile(model);
  assert.throws(() => createServiceTimeImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [{ entityId: "db", serviceTimeP95Ms: null }],
  }), /recorded service-time evidence/);
});

test("service-time improvement reruns the same stressed scenario and preserves base profile/model", () => {
  const model = createModel();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(model, { durationMs: 10000, seed: 211 }));
  const sourceProfile = structuredClone(profile);
  const originalSuite = runWorkbenchExperiments({ workbench: model, simulationProfile: profile, trafficMultiplier: 5 });
  assert.equal(originalSuite.status, "completed");
  const scenarioKey = chooseCapacityImprovementScenarioKey(originalSuite.runs, "baseline");
  assert.equal(scenarioKey, "trafficSurge");
  const originalScenario = originalSuite.runs[scenarioKey];
  const rows = getCapacityPressureRows(originalScenario);
  assert.ok(rows.some((row) => Number.isFinite(row.serviceTimeP95Ms) && row.serviceTimeP95Ms > 0));
  const improvement = createServiceTimeImprovementProfile({ profile, workbench: model, scopeEntityIds: ["web", "api", "endpoint", "db"], componentRows: rows });
  const trialSuite = runWorkbenchExperiments({ workbench: model, simulationProfile: improvement.profile, trafficMultiplier: 5 });
  assert.equal(trialSuite.status, "completed");
  const improvedScenario = trialSuite.runs[scenarioKey];
  const comparison = compareSimulationRuns(originalScenario.result, improvedScenario.result);
  assert.equal(comparison.status, "ready");
  const latency = comparison.metrics.find((item) => item.key === "p95LatencyMs");
  const drops = comparison.metrics.find((item) => item.key === "droppedRequests");
  assert.ok(latency.after < latency.before, `reduced service time should lower modeled p95 in this fixture: ${JSON.stringify(latency)}`);
  assert.ok(drops.after < drops.before, `reduced service time should lower modeled drops in this fixture: ${JSON.stringify(drops)}`);
  const series = buildTimeSeriesComparisonPoints(originalScenario.result, improvedScenario.result);
  assert.equal(series.status, "ready");
  assert.ok(series.points.length > 0);
  assert.deepEqual(profile, sourceProfile);
  assert.equal(model.modelRevision, 7);
});

test("UI offers a distinct service-time hypothesis and records intervention metadata", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Test lower service time/);
  assert.match(panel, /createServiceTimeImprovementProfile/);
  assert.match(panel, /interventionKind/);
  assert.match(panel, /Mean service time changed from/);
  assert.match(panel, /serviceTimeTraceTargetEntityId/);
});
