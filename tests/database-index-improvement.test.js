import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";
import { createReactRestPostgresPoc } from "../src/features/workbench/workbenchPocTemplate.js";
import { generateSqlArtifact } from "../src/features/workbench/workbenchArtifacts.js";
import { WORKBENCH_COMPONENTS } from "../src/features/workbench/workbenchRegistry.js";
import {
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
  getCapacityPressureRows,
  chooseCapacityImprovementScenarioKey,
  getDatabaseIndexCandidates,
  createDatabaseIndexImprovementProfile,
  compareSimulationRuns,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { buildSimulationProjection } from "../src/features/simulation/adapter/buildSimulationProjection.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";

function idFactory() {
  let n = 0;
  return (prefix) => `${prefix}-idx-${++n}`;
}
function emptyWorkbench() {
  return createWorkbenchExtension({
    activeViewId: "system", modelRevision: 0,
    views: [{ id: "system", label: "System" }, { id: "apis", label: "APIs" }, { id: "data", label: "Data" }, { id: "deployment", label: "Deployment" }],
    viewScenes: { apis: { elements: [], appState: {}, files: {} }, data: { elements: [], appState: {}, files: {} }, deployment: { elements: [], appState: {}, files: {} } },
    entities: [], relations: [],
  });
}
function makePoc() {
  return createReactRestPostgresPoc({ workbench: emptyWorkbench(), idFactory: idFactory() });
}
function runStressed(workbench, profile) {
  return runWorkbenchExperiments({ workbench, simulationProfile: profile, trafficMultiplier: 5 });
}
function fixtureRows(workbench, profile) {
  const suite = runStressed(workbench, markSimulationAssumptionsConfirmed(profile));
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics));
  const scenarioKey = chooseCapacityImprovementScenarioKey(suite.runs, "baseline");
  assert.equal(scenarioKey, "trafficSurge");
  const rows = getCapacityPressureRows(suite.runs[scenarioKey]);
  return { suite, scenarioKey, rows };
}

test("PostgreSQL table registry exposes a schema-backed index property", () => {
  const table = WORKBENCH_COMPONENTS.find((item) => item.kind === "data.postgresql-table");
  assert.ok(table);
  assert.equal(table.properties.find((field) => field.key === "indexes")?.type, "json");
});

test("index candidate requires typed read path, actual read evidence, and an eligible unindexed column", () => {
  const workbench = makePoc();
  const profile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const { rows } = fixtureRows(workbench, profile);
  const candidates = getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows });
  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((candidate) => candidate.evidence.readOperationsStarted > 0));
  assert.ok(candidates.every((candidate) => candidate.columnName !== "id"));

  const noRead = getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows.map((row) => row.entityId === candidates[0].entityId ? { ...row, readOperationsStarted: 0 } : row) });
  assert.deepEqual(noRead, []);

  const malformedIndexes = structuredClone(workbench);
  malformedIndexes.entities.find((entity) => entity.kind === "data.postgresql-table").properties.indexes = "[{bad json";
  assert.deepEqual(getDatabaseIndexCandidates({ profile, workbench: malformedIndexes, scopeEntityIds: malformedIndexes.entities.map((entity) => entity.id), componentRows: rows }), [], "malformed schema index metadata must not be treated as an empty index list");

  const noTypedRead = structuredClone(workbench);
  noTypedRead.relations = noTypedRead.relations.filter((relation) => relation.kind !== "reads");
  assert.deepEqual(getDatabaseIndexCandidates({ profile, workbench: noTypedRead, scopeEntityIds: noTypedRead.entities.map((entity) => entity.id), componentRows: rows }), []);
});

test("index candidate excludes primary, unique and already-indexed columns", () => {
  const workbench = makePoc();
  const table = workbench.entities.find((entity) => entity.kind === "data.postgresql-table");
  table.properties.columns = JSON.stringify([
    { name: "id", type: "UUID", primaryKey: true, nullable: false },
    { name: "email", type: "TEXT", unique: true },
    { name: "status", type: "TEXT", nullable: true },
  ]);
  table.properties.indexes = JSON.stringify([{ name: "idx_items_status", columns: ["status"], method: "btree", unique: false }]);
  const profile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const { rows } = fixtureRows(workbench, profile);
  const candidates = getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows });
  assert.deepEqual(candidates, []);
});

test("index trial requires explicit column selection when aggregate read evidence has multiple candidates", () => {
  const workbench = makePoc();
  const profile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const { rows } = fixtureRows(workbench, profile);
  const candidates = getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows });
  assert.ok(candidates.length > 1);
  assert.throws(() => createDatabaseIndexImprovementProfile({ profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows }), /choose the proposed table column explicitly/i);
});

test("selected index hypothesis changes one cloned profile assumption and supplies reviewable DDL", () => {
  const workbench = makePoc();
  const profile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const sourceProfile = structuredClone(profile);
  const sourceModel = structuredClone(workbench);
  const { rows } = fixtureRows(workbench, profile);
  const improvement = createDatabaseIndexImprovementProfile({
    profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows,
    preferredEntityId: workbench.entities.find((entity) => entity.kind === "data.postgresql-database").id,
    preferredTableId: workbench.entities.find((entity) => entity.kind === "data.postgresql-table").id,
    preferredColumnName: "name",
  });
  const db = workbench.entities.find((entity) => entity.kind === "data.postgresql-database");
  assert.equal(improvement.entityId, db.id);
  assert.equal(improvement.field, "indexBenefitReadFraction");
  assert.equal(improvement.before, 0);
  assert.equal(improvement.after, 0.25);
  assert.match(improvement.proposedIndex.sqlStatement, /CREATE INDEX IF NOT EXISTS/);
  assert.match(improvement.proposedIndex.sqlStatement, /"items".*"name"/);
  assert.match(improvement.modelingLimit, /no SQL query plan or real PostgreSQL index behavior is simulated/i);
  assert.equal(improvement.profile.profilesByEntityId[db.id].parameters.indexBenefitReadFraction, 0.25);
  assert.equal(improvement.profile.profilesByEntityId[db.id].parameters.indexReadSpeedupFactor, 3);
  assert.deepEqual(profile, sourceProfile, "source profile must not mutate");
  assert.deepEqual(workbench, sourceModel, "canonical model must not mutate");
});

test("index hypothesis reruns the same stressed scenario and changes outputs from actual simulated read events", () => {
  const workbench = makePoc();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 15000, seed: 211 }));
  const originalProfile = structuredClone(profile);
  const originalModelRevision = workbench.modelRevision;
  const baselineSuite = runStressed(workbench, profile);
  assert.equal(baselineSuite.status, "completed");
  const scenarioKey = chooseCapacityImprovementScenarioKey(baselineSuite.runs, "baseline");
  assert.equal(scenarioKey, "trafficSurge");
  const beforeRun = baselineSuite.runs[scenarioKey];
  const rows = getCapacityPressureRows(beforeRun);
  const table = workbench.entities.find((entity) => entity.kind === "data.postgresql-table");
  const database = workbench.entities.find((entity) => entity.kind === "data.postgresql-database");
  const trial = createDatabaseIndexImprovementProfile({
    profile, workbench, scopeEntityIds: workbench.entities.map((entity) => entity.id), componentRows: rows,
    preferredEntityId: database.id, preferredTableId: table.id, preferredColumnName: "name",
  });
  const afterSuite = runStressed(workbench, trial.profile);
  assert.equal(afterSuite.status, "completed", JSON.stringify(afterSuite.diagnostics));
  const afterRun = afterSuite.runs[scenarioKey];
  assert.equal(afterRun.result.status, "completed");
  assert.equal(afterRun.overrides.trafficMultiplier, beforeRun.overrides.trafficMultiplier);
  assert.equal(afterRun.result.result.simulation.seed, beforeRun.result.result.simulation.seed);
  assert.equal(afterRun.result.result.simulation.durationMs, beforeRun.result.result.simulation.durationMs);
  const dbRows = afterRun.result.result.perNode.filter((row) => row.sourceEntityId === database.id);
  assert.ok(dbRows[0].readOperationsStarted > 0);
  assert.ok(dbRows[0].indexedReadOperationsStarted > 0);
  assert.ok(dbRows[0].indexAssumedTimeSavedMsTotal > 0);
  const indexedTrace = afterRun.result.result.requestTraces.traces.flatMap((trace) => trace.hops || []).find((hop) => hop.entityId === database.id && hop.operation === "read" && hop.indexAssumptionApplied === true);
  assert.ok(indexedTrace, "actual read trace should expose the applied synthetic assumption");
  assert.equal(indexedTrace.indexReadSpeedupFactor, 3);
  assert.ok(indexedTrace.indexTimeSavedMs > 0);
  const comparison = compareSimulationRuns(beforeRun.result, afterRun.result);
  assert.equal(comparison.status, "ready");
  assert.ok(comparison.metrics.find((metric) => metric.key === "p95LatencyMs").after < comparison.metrics.find((metric) => metric.key === "p95LatencyMs").before);
  assert.ok(comparison.metrics.find((metric) => metric.key === "droppedRequests").after < comparison.metrics.find((metric) => metric.key === "droppedRequests").before);
  assert.deepEqual(profile, originalProfile);
  assert.equal(workbench.modelRevision, originalModelRevision, "trial must not mutate semantic model revision");
});

test("projection accepts optional index parameters but rejects invalid hypothesis ranges", () => {
  const workbench = makePoc();
  const profile = markSimulationAssumptionsConfirmed(workbench.simulationProfile);
  const db = workbench.entities.find((entity) => entity.kind === "data.postgresql-database");
  const legacy = structuredClone(profile);
  delete legacy.profilesByEntityId[db.id].parameters.indexBenefitReadFraction;
  delete legacy.profilesByEntityId[db.id].parameters.indexReadSpeedupFactor;
  delete legacy.profilesByEntityId[db.id].assumptions.indexBenefitReadFraction;
  delete legacy.profilesByEntityId[db.id].assumptions.indexReadSpeedupFactor;
  assert.equal(buildSimulationProjection({ workbench, simulationProfile: legacy }).status, "ready", "legacy profiles without optional fields remain valid");
  const invalid = structuredClone(profile);
  invalid.profilesByEntityId[db.id].parameters.indexBenefitReadFraction = 1.2;
  const projection = buildSimulationProjection({ workbench, simulationProfile: invalid });
  assert.equal(projection.status, "blocked");
  assert.ok(projection.diagnostics.some((item) => item.code === "SIM-PROFILE-PARAMETER-INVALID" || /indexBenefitReadFraction/.test(item.message)));
});

test("UI exposes the index hypothesis, explicit column choice, and opt-in schema mutation", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const engine = await readFile(new URL("../src/features/simulation/engine/runSimulation.js", import.meta.url), "utf8");
  assert.match(panel, /Query \/ index hypothesis/);
  assert.match(panel, /Choose a column to hypothesize an index/);
  assert.match(panel, /createDatabaseIndexImprovementProfile/);
  assert.match(panel, /Add candidate index to schema model/);
  assert.match(panel, /onUpdateEntity\(table\.id/);
  assert.match(engine, /indexAssumptionApplied/);
  assert.match(engine, /indexAssumedTimeSavedMsTotal/);
});

test("index assumptions produce real CREATE INDEX output only after explicit schema acceptance", () => {
  const workbench = makePoc();
  const table = workbench.entities.find((entity) => entity.kind === "data.postgresql-table");
  table.properties.indexes = JSON.stringify([{ name: "idx_items_name", columns: ["name"], method: "btree", unique: false }]);
  const generated = generateSqlArtifact(workbench);
  assert.equal(generated.ok, true, JSON.stringify(generated.errors));
  assert.match(generated.text, /CREATE INDEX IF NOT EXISTS "idx_items_name" ON "public"\."items" USING btree \("name"\);/);
  assert.equal(workbench.modelRevision, 1, "pure artifact generation cannot mutate the Workbench model");
  const invalid = structuredClone(workbench);
  invalid.entities.find((entity) => entity.kind === "data.postgresql-table").properties.indexes = JSON.stringify([{ name: "idx_items_invalid", columns: ["not_a_column"], method: "btree" }]);
  const blocked = generateSqlArtifact(invalid);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.text, "");
  assert.ok(blocked.errors.some((item) => item.code === "sql.invalid-index-columns"));
});
