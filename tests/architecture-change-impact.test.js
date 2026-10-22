import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { architectureSnapshotsMatch, buildArchitectureChangeImpact } from "../src/features/simulation/experiments/architectureChangeImpact.js";

const snapshot = (entities, relations = []) => ({ modelRevision: 1, entities, relations });
const entity = (id, kind = "backend.rest-service", name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId, properties = {}) => ({ id, kind, sourceId, targetId, properties });

test("architecture snapshots compare semantic content independent of array and object-key order", () => {
  const left = snapshot([entity("api", "backend.rest-service", "API", { timeout: 100, retry: { max: 2, backoff: 20 } }), entity("web", "frontend.react-app")], [relation("web-api", "calls", "web", "api")]);
  const right = snapshot([entity("web", "frontend.react-app"), entity("api", "backend.rest-service", "API", { retry: { backoff: 20, max: 2 }, timeout: 100 })], [relation("web-api", "calls", "web", "api")]);
  assert.equal(architectureSnapshotsMatch(left, right), true);
  assert.equal(buildArchitectureChangeImpact({ baselineSnapshot: left, proposedSnapshot: right }).status, "identical");
});

test("detects added, removed and modified components plus changed typed relationships", () => {
  const before = snapshot([
    entity("web", "frontend.react-app", "Web"),
    entity("api", "backend.rest-service", "API", { timeoutMs: 1000 }),
    entity("old-db", "data.postgresql-database", "Legacy DB"),
  ], [relation("web-api", "calls", "web", "api"), relation("api-db", "reads", "api", "old-db")]);
  const after = snapshot([
    entity("web", "frontend.react-app", "Web"),
    entity("api", "backend.rest-service", "API", { timeoutMs: 2000 }),
    entity("new-db", "data.postgresql-database", "New DB"),
  ], [relation("web-api", "calls", "web", "api"), relation("api-new-db", "writes", "api", "new-db")]);
  const impact = buildArchitectureChangeImpact({ baselineSnapshot: before, proposedSnapshot: after });
  assert.equal(impact.status, "changed");
  assert.deepEqual(impact.entityChanges.added.map((item) => item.id), ["new-db"]);
  assert.deepEqual(impact.entityChanges.removed.map((item) => item.id), ["old-db"]);
  assert.equal(impact.entityChanges.modified.find((item) => item.id === "api").fields.includes("properties.timeoutMs"), true);
  assert.deepEqual(impact.relationChanges.added.map((item) => item.id), ["api-new-db"]);
  assert.deepEqual(impact.relationChanges.removed.map((item) => item.id), ["api-db"]);
  assert.ok(impact.affectedEntityIds.includes("api"));
  assert.ok(impact.affectedEntityIds.includes("new-db"));
  assert.equal(impact.changeCount, 5);
});

test("does not fabricate impact analysis when a saved snapshot is absent", () => {
  const impact = buildArchitectureChangeImpact({ baselineSnapshot: null, proposedSnapshot: snapshot([entity("api")]) });
  assert.equal(impact.status, "unavailable");
  assert.match(impact.reason, /does not contain a semantic model snapshot/);
  assert.equal(impact.changeCount, 0);
});

const metrics = (overrides = {}) => ({
  throughputRps: 80,
  successRate: 0.95,
  droppedRequests: 8,
  failedRequests: 4,
  successfulLatencyMs: { p95: 230 },
  ...overrides,
});

test("compares simulation metrics only for fresh model results with matching profile fingerprints and component scope", () => {
  const impact = buildArchitectureChangeImpact({
    baselineSnapshot: snapshot([entity("api", "backend.rest-service", "API", { timeoutMs: 1000 })]),
    proposedSnapshot: snapshot([entity("api", "backend.rest-service", "API", { timeoutMs: 2000 })]),
    baselineMetrics: metrics(),
    proposedMetrics: metrics({ throughputRps: 92, successRate: 0.98, droppedRequests: 2, failedRequests: 1, successfulLatencyMs: { p95: 175 } }),
    proposedResultsMatchModel: true,
    baselineProfileFingerprint: "same-profile",
    proposedProfileFingerprint: "same-profile",
    baselineScopeEntityIds: ["api"],
    proposedScopeEntityIds: ["api"],
  });
  assert.equal(impact.simulation.status, "comparable");
  assert.equal(impact.simulation.metrics.find((item) => item.key === "throughputRps").delta, 12);
  assert.equal(impact.simulation.metrics.find((item) => item.key === "p95LatencyMs").direction, "improved");
  assert.equal(impact.simulation.metrics.find((item) => item.key === "droppedRequests").direction, "improved");
  assert.match(impact.simulation.reason, /synthetic simulation results/);
});

test("withholds metric deltas when results are stale, scope differs, or profile assumptions differ", () => {
  const input = {
    baselineSnapshot: snapshot([entity("api")]), proposedSnapshot: snapshot([entity("api", "backend.rest-service", "API 2")]),
    baselineMetrics: metrics(), proposedMetrics: metrics({ throughputRps: 100 }), baselineProfileFingerprint: "profile-a", proposedProfileFingerprint: "profile-a",
    baselineScopeEntityIds: ["api"], proposedScopeEntityIds: ["api"],
  };
  assert.equal(buildArchitectureChangeImpact({ ...input, proposedResultsMatchModel: false }).simulation.status, "stale-or-unavailable");
  assert.equal(buildArchitectureChangeImpact({ ...input, proposedResultsMatchModel: true, proposedScopeEntityIds: ["api", "db"] }).simulation.status, "context-mismatch");
  assert.equal(buildArchitectureChangeImpact({ ...input, proposedResultsMatchModel: true, proposedProfileFingerprint: "profile-b" }).simulation.status, "context-mismatch");
});

test("simulation panel exposes saved-baseline selection, affected component focus, and metric caveats", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Architecture change impact/);
  assert.match(panel, /Saved architecture baseline/);
  assert.match(panel, /Focus component/);
  assert.match(panel, /Simulation impact/);
  assert.match(panel, /metric deltas are shown only when the current run matches the proposed model and profile fingerprints and component scopes match/i);
});
