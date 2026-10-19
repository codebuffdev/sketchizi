import test from "node:test";
import assert from "node:assert/strict";
import { appendSimulationHistory, assessSimulationReproducibility, compareSimulationHistoryEntries, createSimulationHistoryEntry, renameSimulationHistoryEntry, restoreSimulationHistoryEntry, searchSimulationHistory, simulationResultsAreStale, SIMULATION_HISTORY_LIMIT } from "../src/features/simulation/experiments/simulationHistory.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";
import { createIllustrativeSimulationProfile, markSimulationAssumptionsConfirmed } from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { createWorkbenchExtension, readWorkbenchDocument, withWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, properties: {} });
function fixture() {
  const workbench = createWorkbenchExtension({
    activeViewId: "system", modelRevision: 12,
    views: [{ id: "system", label: "System" }, { id: "data", label: "Data" }],
    viewScenes: { data: { elements: [], appState: {}, files: {} } },
    entities: [entity("web", "frontend.react-app"), entity("api", "backend.rest-service"), entity("db", "data.postgresql-database")],
    relations: [relation("web-api", "calls", "web", "api"), relation("api-db", "reads", "api", "db")],
  });
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 5000, seed: 91 }));
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile });
  assert.equal(suite.status, "completed");
  return { workbench, profile, suite };
}

test("history snapshots retain metrics, node evidence, explanations and provenance but omit compiled projection", () => {
  const { workbench, profile, suite } = fixture();
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-17T12:00:00.000Z" });
  assert.equal(entry.modelRevision, 12);
  assert.ok(entry.profileSnapshot.profilesByEntityId.api.parameters.meanServiceMs > 0);
  assert.ok(entry.runs.baseline.result.metrics.offeredRequests > 0);
  assert.equal(entry.runs.baseline.result.timeSeries.points.length, 40);
  assert.equal(entry.runs.trafficSurge.result.timeSeries.source, "discrete-event-timestamps");
  assert.equal(entry.runs.baseline.result.requestTraces.source, "discrete-event-request-lifecycle");
  assert.ok(entry.runs.baseline.result.requestTraces.traces.length <= entry.runs.baseline.result.requestTraces.limit);
  assert.ok(Array.isArray(entry.runs.baseline.result.perNode));
  assert.ok(Array.isArray(entry.runs.trafficSurge.explanations));
  assert.equal("projection" in entry, false);
  assert.equal("profileUsed" in entry, false);
  assert.equal(JSON.stringify(entry).includes("eventQueue"), false);
});

test("history preserves active-view seeds and traffic-source roots for scoped simulations", () => {
  const { workbench, profile } = fixture();
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile, scopeEntityIds: ["web", "api", "db"] });
  assert.equal(suite.status, "completed");
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-18T00:00:00.000Z" });
  assert.deepEqual(entry.scopeViewEntityIds, ["api", "db", "web"]);
  assert.deepEqual(entry.scopeSeedEntityIds, ["api", "db", "web"]);
  assert.deepEqual(entry.scopeRootEntityIds, ["web"]);
  const restored = restoreSimulationHistoryEntry(entry);
  assert.deepEqual(restored.provenance.scopeViewEntityIds, ["api", "db", "web"]);
  assert.deepEqual(restored.provenance.scopeRootEntityIds, ["web"]);
});

test("saved history reopens as results without rerunning the engine", () => {
  const { workbench, profile, suite } = fixture();
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-17T12:00:00.000Z" });
  const restored = restoreSimulationHistoryEntry(entry);
  assert.equal(restored.historyEntryId, entry.id);
  assert.equal(restored.provenance.modelRevision, 12);
  assert.equal(restored.runs.baseline.result.status, "completed");
  assert.deepEqual(restored.runs.baseline.result.result.metrics, entry.runs.baseline.result.metrics);
  assert.deepEqual(restored.runs.baseline.result.result.timeSeries, entry.runs.baseline.result.timeSeries);
  assert.deepEqual(restored.runs.baseline.result.result.requestTraces, entry.runs.baseline.result.requestTraces);
  assert.deepEqual(restored.runs.trafficSurge.explanations, entry.runs.trafficSurge.explanations);
  assert.equal(restored.sourceModelSnapshot.entities.find((item) => item.id === "api").name, "api");
});

test("saved history becomes stale when semantic names/properties or simulation assumptions change", () => {
  const { workbench, profile, suite } = fixture();
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-17T12:00:00.000Z" });
  const restored = restoreSimulationHistoryEntry(entry);
  assert.equal(simulationResultsAreStale(restored, workbench, profile), false);

  const renamedModel = structuredClone(workbench);
  renamedModel.entities.find((item) => item.id === "api").name = "Renamed API";
  // Deliberately leave modelRevision unchanged to verify the snapshot catches stale semantics.
  assert.equal(simulationResultsAreStale(restored, renamedModel, profile), true);

  const changedProfile = structuredClone(profile);
  changedProfile.profilesByEntityId.api.parameters.meanServiceMs += 5;
  assert.equal(simulationResultsAreStale(restored, workbench, changedProfile), true);
});

test("controlled one-variable experiment history uses the saved base profile for freshness and retains its change metadata", () => {
  const { workbench, profile, suite } = fixture();
  const trialProfile = structuredClone(profile);
  trialProfile.profilesByEntityId.db.parameters.concurrency += 2;
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: trialProfile, createdAt: "2026-10-18T01:00:00.000Z" });
  entry.experimentMetadata = {
    kind: "one-variable-improvement",
    title: "Checkout PostgreSQL: concurrency 6 → 8",
    changedEntityId: "db",
    field: "concurrency",
    before: 6,
    after: 8,
    baseProfileSnapshot: structuredClone(profile),
  };
  const restored = restoreSimulationHistoryEntry(entry);
  assert.equal(restored.experimentMetadata.title, "Checkout PostgreSQL: concurrency 6 → 8");
  assert.equal(simulationResultsAreStale(restored, workbench, profile), false);
  const changedBase = structuredClone(profile);
  changedBase.profilesByEntityId.db.parameters.meanServiceMs += 1;
  assert.equal(simulationResultsAreStale(restored, workbench, changedBase), true);
});

test("semantic freshness ignores object-key insertion order but detects actual value changes", () => {
  const { workbench, profile, suite } = fixture();
  workbench.entities.find((item) => item.id === "api").properties = {
    timeout: 1500,
    retry: { maxAttempts: 2, backoffMs: 40 },
  };
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-17T12:00:00.000Z" });
  const restored = restoreSimulationHistoryEntry(entry);

  const equivalent = structuredClone(workbench);
  equivalent.entities.reverse();
  const api = equivalent.entities.find((item) => item.id === "api");
  api.properties = {
    retry: { backoffMs: 40, maxAttempts: 2 },
    timeout: 1500,
  };
  equivalent.relations.reverse();
  const equivalentProfile = structuredClone(profile);
  equivalentProfile.defaultScenario = Object.fromEntries(Object.entries(equivalentProfile.defaultScenario).reverse());
  const profileParameters = equivalentProfile.profilesByEntityId.api.parameters;
  equivalentProfile.profilesByEntityId.api.parameters = Object.fromEntries(Object.entries(profileParameters).reverse());
  assert.equal(simulationResultsAreStale(restored, equivalent, equivalentProfile), false);

  api.properties.retry.backoffMs = 41;
  assert.equal(simulationResultsAreStale(restored, equivalent, profile), true);
  assert.equal(simulationResultsAreStale(restored, workbench, { ...profile, defaultScenario: { ...profile.defaultScenario, seed: profile.defaultScenario.seed + 1 } }), true);
});

test("history round-trips inside .sketchizi metadata while preserving unknown extensions and scene elements", () => {
  const { workbench, profile, suite } = fixture();
  const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-17T12:00:00.000Z" });
  const extension = { ...workbench, simulationProfile: profile, simulationHistory: [entry] };
  const elements = [{ id: "note", type: "text", text: "keep me", x: 1, y: 2, width: 80, height: 20 }];
  const drawing = parseDrawing(serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, metadata: {}, extensions: withWorkbenchExtension({ "com.example.unknown": { ok: true } }, extension) }));
  const reopened = readWorkbenchDocument(drawing).workbench;
  assert.equal(reopened.simulationHistory[0].id, entry.id);
  assert.deepEqual(reopened.simulationHistory[0].runs.baseline.result.metrics, entry.runs.baseline.result.metrics);
  assert.deepEqual(reopened.simulationHistory[0].runs.baseline.result.requestTraces, entry.runs.baseline.result.requestTraces);
  assert.deepEqual(drawing.elements, elements);
  assert.deepEqual(drawing.extensions["com.example.unknown"], { ok: true });
});

test("history prepends, de-duplicates and caps saved experiment suites", () => {
  const { workbench, profile, suite } = fixture();
  const entries = Array.from({ length: SIMULATION_HISTORY_LIMIT + 2 }, (_, index) => createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: `2026-10-17T12:00:${String(index).padStart(2, "0")}.000Z` }));
  let history = [];
  for (const entry of entries) history = appendSimulationHistory(history, entry);
  assert.equal(history.length, SIMULATION_HISTORY_LIMIT);
  assert.equal(history[0].id, entries.at(-1).id);
  assert.deepEqual(appendSimulationHistory(history, entries.at(-1)).map((entry) => entry.id), history.map((entry) => entry.id));
});

test("blocked or invalid history entries are rejected", () => {
  assert.throws(() => createSimulationHistoryEntry({ status: "blocked", runs: {} }), /Only completed or partial/);
  assert.throws(() => appendSimulationHistory([], { schemaVersion: 99, id: "bad" }), /Invalid simulation history/);
  assert.throws(() => restoreSimulationHistoryEntry({ schemaVersion: 1, runs: [] }), /invalid or unsupported/);
});

test("saved experiment library supports rename, search, and comparable metric deltas without mutating evidence", () => {
  const { workbench, profile, suite } = fixture();
  const first = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-18T10:00:00.000Z", id: "first" });
  const second = structuredClone(first);
  second.id = "second";
  second.name = "Traffic capacity trial";
  second.modelFingerprint = "different-model";
  second.runs.baseline.result.metrics.throughputRps += 12;
  second.runs.baseline.result.metrics.successfulLatencyMs.p95 += 4;
  second.runs.baseline.result.metrics.failedRequests = 2;
  const history = [first, second];
  const renamed = renameSimulationHistoryEntry(history, "first", "Baseline reference");
  assert.equal(renamed[0].name, "Baseline reference");
  assert.equal(history[0].name, first.name);
  assert.deepEqual(searchSimulationHistory(renamed, "baseline reference").map((entry) => entry.id), ["first"]);
  assert.deepEqual(searchSimulationHistory(renamed, "traffic capacity").map((entry) => entry.id), ["second"]);
  const comparison = compareSimulationHistoryEntries(renamed[0], renamed[1]);
  const baseline = comparison.rows.find((row) => row.key === "baseline");
  assert.equal(baseline.metrics.find((metric) => metric.key === "throughputRps").delta, 12);
  assert.equal(baseline.metrics.find((metric) => metric.key === "p95LatencyMs").delta, 4);
  assert.ok(Number.isFinite(baseline.metrics.find((metric) => metric.key === "failedRatePercent").delta));
  assert.ok(comparison.warnings.some((warning) => warning.includes("Model fingerprints differ")));
  assert.throws(() => renameSimulationHistoryEntry(history, "first", "  "), /cannot be empty/);
});


test("reproducibility assessment requires matching provenance, scenario fingerprints, and metrics", () => {
  const { workbench, profile, suite } = fixture();
  const original = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-19T10:00:00.000Z", id: "repro-original" });
  const exactReplay = structuredClone(original); exactReplay.id = "repro-exact";
  assert.deepEqual(assessSimulationReproducibility(original, exactReplay), {
    status: "exact-match", complete: true, sameInputs: true, sameMetrics: true, sameRunFingerprints: true, sameScenarioSet: true, warnings: [],
  });

  const differentInputs = structuredClone(exactReplay);
  differentInputs.id = "repro-different-inputs"; differentInputs.profileFingerprint = "different-profile";
  assert.equal(assessSimulationReproducibility(original, differentInputs).status, "metrics-match-inputs-differ");

  const changedMetrics = structuredClone(exactReplay);
  changedMetrics.id = "repro-metrics-differ"; changedMetrics.runs.baseline.result.metrics.successfulRequests += 1;
  assert.equal(assessSimulationReproducibility(original, changedMetrics).status, "metrics-differ");

  const incomplete = structuredClone(exactReplay);
  incomplete.id = "repro-incomplete"; delete incomplete.runs.outage;
  assert.equal(assessSimulationReproducibility(original, incomplete).status, "incomplete");
});

test("changed simulation assumptions alter profile and run fingerprints and are never called exact reproduction", () => {
  const { workbench, profile, suite } = fixture();
  const original = createSimulationHistoryEntry(suite, { workbench, simulationProfile: profile, createdAt: "2026-10-19T11:00:00.000Z", id: "assumption-original" });
  const changedProfile = structuredClone(profile);
  changedProfile.defaultScenario.seed += 1;
  const changedSuite = runWorkbenchExperiments({ workbench, simulationProfile: changedProfile });
  assert.equal(changedSuite.status, "completed");
  const changed = createSimulationHistoryEntry(changedSuite, { workbench, simulationProfile: changedProfile, createdAt: "2026-10-19T11:01:00.000Z", id: "assumption-changed" });
  assert.notEqual(original.profileFingerprint, changed.profileFingerprint);
  assert.notEqual(original.runs.baseline.result.simulation.runFingerprint, changed.runs.baseline.result.simulation.runFingerprint);
  const assessment = assessSimulationReproducibility(original, changed);
  assert.equal(assessment.status, "metrics-differ");
  assert.ok(assessment.warnings.some((warning) => warning.includes("Profile fingerprints")));
  assert.notEqual(assessment.status, "exact-match");
});

test("reproducibility assessment rejects malformed inputs instead of guessing", () => {
  assert.throws(() => assessSimulationReproducibility(null, {}), /valid saved experiment entries/);
});
