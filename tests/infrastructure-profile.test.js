import test from "node:test";
import assert from "node:assert/strict";
import {
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";
import {
  ensureInfrastructureProfileDefaults,
  summarizeInfrastructureProfile,
  updateInfrastructureField,
} from "../src/features/simulation/experiments/infrastructureProfile.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";
import {
  createSimulationHistoryEntry,
  createSimulationModelSnapshot,
  restoreSimulationHistoryEntry,
  simulationResultsAreStale,
} from "../src/features/simulation/experiments/simulationHistory.js";

const workbench = {
  modelRevision: 7,
  entities: [
    { id: "api", kind: "backend.rest-service", name: "REST service", properties: {} },
    { id: "db", kind: "data.postgresql-database", name: "PostgreSQL", properties: {} },
  ],
  relations: [],
};

test("new infrastructure profiles never invent resource sizes", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  const rest = profile.infrastructureByEntityId.api;
  const db = profile.infrastructureByEntityId.db;
  assert.equal(rest.fields.replicaCount.value, null);
  assert.equal(rest.fields.vCpuPerInstance.value, null);
  assert.equal(rest.fields.memoryGbPerInstance.value, null);
  assert.equal(rest.fields.replicaCount.evidence, "unknown");
  assert.equal(db.fields.vCpu.value, null);
  assert.equal(db.fields.memoryGb.value, null);
  assert.equal(db.fields.maxConnections.value, null);
  assert.equal(db.fields.hostingModel.value, "unknown");
});

test("editing a value marks it estimated until its evidence source is specified", () => {
  let profile = createIllustrativeSimulationProfile(workbench);
  profile = updateInfrastructureField(profile, "api", "replicaCount", "value", 3);
  assert.equal(profile.infrastructureByEntityId.api.fields.replicaCount.value, 3);
  assert.equal(profile.infrastructureByEntityId.api.fields.replicaCount.evidence, "user-estimated");
  profile = updateInfrastructureField(profile, "api", "replicaCount", "evidence", "deployment-configured");
  assert.equal(profile.infrastructureByEntityId.api.fields.replicaCount.evidence, "deployment-configured");
  const summary = summarizeInfrastructureProfile(profile.infrastructureByEntityId.api);
  assert.equal(summary.populated, 1);
  assert.equal(summary.unknown, summary.total - 1);
});

test("profile migration backfills new fields without overwriting previously entered infrastructure", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  profile.infrastructureByEntityId.api.fields.deploymentPlatform.value = "Render";
  profile.infrastructureByEntityId.api.fields.deploymentPlatform.evidence = "deployment-configured";
  delete profile.infrastructureByEntityId.db.fields.storageIops;
  const migrated = ensureInfrastructureProfileDefaults(profile, workbench);
  assert.equal(migrated.infrastructureByEntityId.api.fields.deploymentPlatform.value, "Render");
  assert.equal(migrated.infrastructureByEntityId.api.fields.deploymentPlatform.evidence, "deployment-configured");
  assert.ok(Object.hasOwn(migrated.infrastructureByEntityId.db.fields, "storageIops"));
});

test("document persistence profile data is carried into recorded run history and restored", () => {
  let profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench));
  profile = updateInfrastructureField(profile, "api", "replicaCount", "value", 2);
  profile = updateInfrastructureField(profile, "api", "replicaCount", "evidence", "measured");
  profile = updateInfrastructureField(profile, "db", "hostingModel", "value", "managed");
  profile = updateInfrastructureField(profile, "db", "hostingModel", "evidence", "deployment-configured");
  const entry = createSimulationHistoryEntry({
    status: "completed",
    provenance: { modelRevision: workbench.modelRevision, scopeEntityIds: ["api", "db"] },
    runs: { baseline: { key: "baseline", label: "Baseline", result: { status: "completed", result: { schemaVersion: 1, metrics: {}, simulation: {}, perNode: [], perEdge: [], bottlenecks: [], provenance: {} } } } },
  }, { workbench, simulationProfile: profile, createdAt: "2026-10-18T12:00:00.000Z", id: "infra-history-test" });
  const restored = restoreSimulationHistoryEntry(entry);
  assert.equal(restored.historyProfileSnapshot.infrastructureByEntityId.api.fields.replicaCount.value, 2);
  assert.equal(restored.historyProfileSnapshot.infrastructureByEntityId.api.fields.replicaCount.evidence, "measured");
  assert.equal(restored.historyProfileSnapshot.infrastructureByEntityId.db.fields.hostingModel.value, "managed");
});

test("editing infrastructure evidence makes prior run results stale without changing model entities", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  const previousResults = {
    provenance: { modelRevision: workbench.modelRevision, scopeEntityIds: ["api", "db"] },
    sourceModelSnapshot: createSimulationModelSnapshot(workbench),
    profileUsed: profile,
  };
  assert.equal(simulationResultsAreStale(previousResults, workbench, profile, ["api", "db"]), false);
  const changed = updateInfrastructureField(profile, "api", "replicaCount", "value", 4);
  assert.equal(simulationResultsAreStale(previousResults, workbench, changed, ["api", "db"]), true);
  assert.deepEqual(workbench.entities.map(({ id }) => id), ["api", "db"]);
});


test("infrastructure metadata is fingerprinted but does not silently change synthetic capacity results", () => {
  const capacityWorkbench = {
    ...workbench,
    entities: [
      { id: "web", kind: "frontend.react-app", name: "React", properties: {} },
      ...workbench.entities,
    ],
    relations: [
      { id: "web-calls-api", kind: "calls", sourceId: "web", targetId: "api", properties: {} },
      { id: "api-reads-db", kind: "reads", sourceId: "api", targetId: "db", properties: {} },
    ],
  };
  const base = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(capacityWorkbench, { durationMs: 10000, seed: 23 }));
  const changedInfrastructure = updateInfrastructureField(base, "api", "vCpuPerInstance", "value", 16);
  const verifiedInfrastructure = updateInfrastructureField(changedInfrastructure, "api", "vCpuPerInstance", "evidence", "measured");
  const before = runWorkbenchExperiments({ workbench: capacityWorkbench, simulationProfile: base });
  const after = runWorkbenchExperiments({ workbench: capacityWorkbench, simulationProfile: verifiedInfrastructure });
  assert.equal(before.status, "completed", JSON.stringify(before.diagnostics));
  assert.equal(after.status, "completed", JSON.stringify(after.diagnostics));
  for (const key of before.scenarioKeys) {
    assert.deepEqual(after.runs[key].result.result.metrics, before.runs[key].result.result.metrics);
    assert.notEqual(after.provenance.profileFingerprint, before.provenance.profileFingerprint);
  }
});


test("load-test evidence survives document profile and historical-run persistence", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  profile.loadTestEvidence = {
    schemaVersion: 1,
    records: [{
      schemaVersion: 1, id: "measured-1", name: "Sustained load", testedAt: "2026-10-18",
      targetEnvironment: "production-api-tier-a", source: "k6 + Prometheus",
      workload: { durationSeconds: 60, offeredRps: 50, concurrency: 100 },
      observed: { throughputRps: 48, p95LatencyMs: 82, errorRatePercent: 0.2, appCpuPercent: 65, appMemoryGb: 1.4, dbCpuPercent: 42, dbConnections: 24, dbP95QueryMs: 18,
        restExclusiveMeanServiceMs: null, restServiceSampleCount: null, dbMeanQueryServiceMs: null, dbServiceSampleCount: null },
      notes: "Imported from a real load test report.",
    }],
  };
  const entry = createSimulationHistoryEntry({
    status: "completed",
    provenance: { modelRevision: workbench.modelRevision, scopeEntityIds: ["api", "db"] },
    runs: { baseline: { key: "baseline", label: "Baseline", result: { status: "completed", result: { schemaVersion: 1, metrics: {}, simulation: {}, perNode: [], perEdge: [], bottlenecks: [], provenance: {} } } } },
  }, { workbench, simulationProfile: profile, createdAt: "2026-10-18T12:00:00.000Z", id: "load-test-history" });
  const restored = restoreSimulationHistoryEntry(entry);
  assert.equal(restored.historyProfileSnapshot.loadTestEvidence.records[0].targetEnvironment, "production-api-tier-a");
  assert.equal(restored.historyProfileSnapshot.loadTestEvidence.records[0].observed.throughputRps, 48);
});

test("adding calibration evidence does not mark existing simulation results stale", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  const previousResults = {
    provenance: { modelRevision: workbench.modelRevision, scopeEntityIds: ["api", "db"] },
    sourceModelSnapshot: createSimulationModelSnapshot(workbench),
    profileUsed: profile,
  };
  const withEvidence = structuredClone(profile);
  withEvidence.loadTestEvidence = { schemaVersion: 1, records: [{ id: "load-test", testedAt: "2026-10-18", targetEnvironment: "env-a", source: "k6", name: "load", workload: { offeredRps: 10, durationSeconds: 30 }, observed: { throughputRps: 9, p95LatencyMs: 70, errorRatePercent: 0 } }] };
  assert.equal(simulationResultsAreStale(previousResults, workbench, withEvidence, ["api", "db"]), false);
});
