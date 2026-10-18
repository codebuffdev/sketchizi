import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createDatabaseContentionImprovementProfile,
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
  getCapacityPressureRows,
  chooseCapacityImprovementScenarioKey,
  compareSimulationRuns,
  buildTimeSeriesComparisonPoints,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, properties: {} });
const createModel = ({ writeRelation = true } = {}) => ({
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
    relation(writeRelation ? "api-writes-db" : "api-reads-db", writeRelation ? "writes" : "reads", "api", "db"),
  ],
});

test("database write-contention trial reduces only the PostgreSQL writeContentionMs assumption", () => {
  const workbench = createModel();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 10000, seed: 211 }));
  const original = structuredClone(profile);
  const trial = createDatabaseContentionImprovementProfile({
    profile,
    workbench,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [{ entityId: "db", writeOperationsStarted: 200, readOperationsStarted: 0, writeContentionMsTotal: 3000, maxDropped: 400, peakUtilization: 0.99 }],
    preferredEntityId: "db",
  });
  assert.equal(trial.entityId, "db");
  assert.equal(trial.field, "writeContentionMs");
  assert.equal(trial.before, 15);
  assert.equal(trial.after, 12);
  assert.equal(trial.selectionReason, "selected-trace-write-contention-evidence");
  assert.equal(trial.profile.profilesByEntityId.db.parameters.writeContentionMs, 12);
  assert.equal(trial.profile.profilesByEntityId.db.parameters.meanServiceMs, original.profilesByEntityId.db.parameters.meanServiceMs);
  assert.equal(trial.profile.profilesByEntityId.db.parameters.concurrency, original.profilesByEntityId.db.parameters.concurrency);
  assert.deepEqual(profile, original, "source profile is not mutated");
  assert.equal(workbench.modelRevision, 7);
  assert.match(trial.profile.profilesByEntityId.db.assumptions.writeContentionMs.note, /does not modify a real database/i);
});

test("database write-contention trial refuses to infer writes from a read-only model", () => {
  const workbench = createModel({ writeRelation: false });
  const profile = createIllustrativeSimulationProfile(workbench);
  assert.throws(() => createDatabaseContentionImprovementProfile({
    profile,
    workbench,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [{ entityId: "db", readOperationsStarted: 400, writeOperationsStarted: 0, writeContentionMsTotal: 0 }],
  }), /recorded writes with positive modeled write-contention overhead/i);
  assert.throws(() => createDatabaseContentionImprovementProfile({
    profile,
    workbench,
    scopeEntityIds: ["web", "api", "endpoint", "db"],
    componentRows: [{ entityId: "db", readOperationsStarted: 400, writeOperationsStarted: 20, writeContentionMsTotal: 300 }],
  }), /recorded writes with positive modeled write-contention overhead/i, "stale/mismatched write rows cannot override read-only model semantics");
});

test("write-contention trial uses the same stressed scenario and preserves model and base profile", () => {
  const workbench = createModel();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 10000, seed: 211 }));
  const originalProfile = structuredClone(profile);
  const beforeSuite = runWorkbenchExperiments({ workbench, simulationProfile: profile, trafficMultiplier: 5 });
  assert.equal(beforeSuite.status, "completed");
  const scenarioKey = chooseCapacityImprovementScenarioKey(beforeSuite.runs, "baseline");
  assert.equal(scenarioKey, "trafficSurge");
  const beforeRun = beforeSuite.runs[scenarioKey];
  const rows = getCapacityPressureRows(beforeRun);
  const dbEvidence = rows.find((row) => row.entityId === "db");
  assert.ok(dbEvidence.writeOperationsStarted > 0);
  assert.ok(dbEvidence.writeContentionMsTotal > 0);
  const trial = createDatabaseContentionImprovementProfile({ profile, workbench, scopeEntityIds: ["web", "api", "endpoint", "db"], componentRows: rows });
  assert.equal(trial.entityId, "db");
  const afterSuite = runWorkbenchExperiments({ workbench, simulationProfile: trial.profile, trafficMultiplier: 5 });
  assert.equal(afterSuite.status, "completed");
  const afterRun = afterSuite.runs[scenarioKey];
  assert.equal(afterRun.result.status, "completed");
  const comparison = compareSimulationRuns(beforeRun.result, afterRun.result);
  assert.equal(comparison.status, "ready");
  const p95 = comparison.metrics.find((item) => item.key === "p95LatencyMs");
  const dropped = comparison.metrics.find((item) => item.key === "droppedRequests");
  assert.ok(p95.after < p95.before, `reducing modeled write contention should reduce p95 in this deterministic fixture: ${JSON.stringify(p95)}`);
  assert.ok(dropped.after < dropped.before, `reducing modeled write contention should reduce drops in this deterministic fixture: ${JSON.stringify(dropped)}`);
  assert.equal(buildTimeSeriesComparisonPoints(beforeRun.result, afterRun.result).status, "ready");
  assert.equal(afterRun.result.result.simulation.seed, beforeRun.result.result.simulation.seed);
  assert.equal(afterRun.result.result.simulation.durationMs, beforeRun.result.result.simulation.durationMs);
  assert.equal(afterRun.overrides.trafficMultiplier, beforeRun.overrides.trafficMultiplier);
  assert.deepEqual(profile, originalProfile);
  assert.equal(workbench.modelRevision, 7);
});

test("UI offers write-contention as a distinct evidence-gated intervention and persists its evidence", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const engine = await readFile(new URL("../src/features/simulation/engine/runSimulation.js", import.meta.url), "utf8");
  assert.match(panel, /Test lower write contention at/);
  assert.match(panel, /PostgreSQL write-contention hypothesis/);
  assert.match(panel, /createDatabaseContentionImprovementProfile/);
  assert.match(panel, /write-contention/);
  assert.match(panel, /read-only relationship cannot produce write-contention evidence/i);
  assert.match(panel, /interventionEvidence: improvement\.evidence/);
  assert.match(engine, /writeOperationsStarted/);
  assert.match(engine, /writeContentionMsTotal/);
});
