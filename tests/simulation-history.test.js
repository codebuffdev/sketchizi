import test from "node:test";
import assert from "node:assert/strict";
import { appendSimulationHistory, createSimulationHistoryEntry, restoreSimulationHistoryEntry, simulationResultsAreStale, SIMULATION_HISTORY_LIMIT } from "../src/features/simulation/experiments/simulationHistory.js";
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
