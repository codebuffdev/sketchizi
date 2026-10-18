import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeSeriesComparisonPoints,
  createCapacityImprovementProfile,
  createIllustrativeSimulationProfile,
  summarizeSimulationImprovement,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";
import { readFile } from "node:fs/promises";

const model = {
  modelRevision: 3,
  entities: [
    { id: "web", kind: "frontend.react-app", name: "React" },
    { id: "api", kind: "backend.rest-service", name: "REST service" },
    { id: "db", kind: "data.postgresql-database", name: "PostgreSQL" },
  ],
};

const runWithPoints = (points, observationWindowMs = 100) => ({
  status: "completed",
  result: {
    metrics: {},
    timeSeries: { source: "discrete-event-timestamps", observationWindowMs, points },
  },
});

const point = (startMs, endMs, values = {}) => ({
  startMs, endMs,
  offeredRps: 10,
  successfulRps: 8,
  latencyP95Ms: 25,
  droppedRequests: 2,
  failedRequests: 0,
  ...values,
});

test("a trace-guided capacity trial prefers the selected eligible component when queue/pressure evidence is supplied", () => {
  const profile = createIllustrativeSimulationProfile(model);
  const trial = createCapacityImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "db"],
    componentRows: [
      { entityId: "db", hasPressure: true, maxDropped: 20, maxFailed: 0, peakUtilization: 0.99 },
      { entityId: "api", hasPressure: true, maxDropped: 1, maxFailed: 0, peakUtilization: 0.85 },
    ],
    preferredEntityId: "api",
  });
  assert.equal(trial.entityId, "api");
  assert.equal(trial.selectionReason, "selected-trace-evidence");
  assert.equal(trial.before, 8);
  assert.equal(trial.after, 10);
  assert.equal(profile.profilesByEntityId.api.parameters.concurrency, 8, "base profile is not mutated");
});

test("an invalid trace target falls back to scenario pressure evidence", () => {
  const profile = createIllustrativeSimulationProfile(model);
  const trial = createCapacityImprovementProfile({
    profile,
    workbench: model,
    scopeEntityIds: ["web", "api", "db"],
    componentRows: [
      { entityId: "db", hasPressure: true, maxDropped: 20, maxFailed: 0, peakUtilization: 0.99 },
    ],
    preferredEntityId: "not-in-scope",
  });
  assert.equal(trial.entityId, "db");
  assert.equal(trial.selectionReason, "scenario-pressure-evidence");
});

test("before/after time-series comparison joins only identical event-derived buckets", () => {
  const before = runWithPoints([
    point(0, 50, { successfulRps: 5, latencyP95Ms: 50, droppedRequests: 8 }),
    point(50, 100, { successfulRps: 6, latencyP95Ms: 60, droppedRequests: 9 }),
  ]);
  const after = runWithPoints([
    point(0, 50, { successfulRps: 8, latencyP95Ms: 30, droppedRequests: 3 }),
    point(50, 100, { successfulRps: 9, latencyP95Ms: 35, droppedRequests: 2 }),
  ]);
  const comparison = buildTimeSeriesComparisonPoints(before, after);
  assert.equal(comparison.status, "ready");
  assert.equal(comparison.source, "matched-discrete-event-timestamps");
  assert.deepEqual(comparison.points.map(({ startMs, endMs, beforeSuccessfulRps, afterSuccessfulRps, beforeLatencyP95Ms, afterLatencyP95Ms, beforeDroppedRequests, afterDroppedRequests }) => ({ startMs, endMs, beforeSuccessfulRps, afterSuccessfulRps, beforeLatencyP95Ms, afterLatencyP95Ms, beforeDroppedRequests, afterDroppedRequests })), [
    { startMs: 0, endMs: 50, beforeSuccessfulRps: 5, afterSuccessfulRps: 8, beforeLatencyP95Ms: 50, afterLatencyP95Ms: 30, beforeDroppedRequests: 8, afterDroppedRequests: 3 },
    { startMs: 50, endMs: 100, beforeSuccessfulRps: 6, afterSuccessfulRps: 9, beforeLatencyP95Ms: 60, afterLatencyP95Ms: 35, beforeDroppedRequests: 9, afterDroppedRequests: 2 },
  ]);
});

test("before/after time-series comparison refuses mismatched bucket boundaries", () => {
  const before = runWithPoints([point(0, 50), point(50, 100)]);
  const after = runWithPoints([point(0, 40), point(40, 100)]);
  const comparison = buildTimeSeriesComparisonPoints(before, after);
  assert.equal(comparison.status, "unavailable");
  assert.match(comparison.reason, /different time buckets/);
  assert.deepEqual(comparison.points, []);
});

test("improvement summary distinguishes gains, regressions, trade-offs, and unchanged output", () => {
  const comparison = (deltas = {}) => ({
    status: "ready",
    metrics: [
      { key: "droppedRequests", delta: { absolute: deltas.droppedRequests ?? -12 } },
      { key: "successRate", delta: { absolute: deltas.successRate ?? 0.05 } },
      { key: "throughputRps", delta: { absolute: deltas.throughputRps ?? 4.2 } },
      { key: "p95LatencyMs", delta: { absolute: deltas.p95LatencyMs ?? -18 } },
    ],
  });
  assert.equal(summarizeSimulationImprovement(comparison()).status, "improved");
  assert.equal(summarizeSimulationImprovement(comparison({ p95LatencyMs: 8 })).status, "mixed");
  assert.equal(summarizeSimulationImprovement(comparison({ droppedRequests: 4, successRate: -0.05, throughputRps: -4, p95LatencyMs: 10 })).status, "regressed");
  assert.equal(summarizeSimulationImprovement(comparison({ droppedRequests: 0, successRate: 0, throughputRps: 0, p95LatencyMs: 0 })).status, "no-material-change");
});

test("UI links traced bottlenecks to capacity trials and shows matched before/after charts", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /isServiceTime \? serviceTimeTraceTargetEntityId : capacityTraceTargetEntityId/);
  assert.match(panel, /createServiceTimeImprovementProfile/);
  assert.match(panel, /Test lower service time/);
  assert.match(panel, /Capacity target from current evidence:/);
  assert.match(panel, /buildTimeSeriesComparisonPoints\(originalScenario\.result, improvedScenario\.result\)/);
  assert.match(panel, /summarizeSimulationImprovement\(comparisonResult\)/);
  assert.match(panel, /<ImprovementTimeSeriesComparison comparison=\{improvementResult\.timeSeriesComparison\}/);
  assert.match(panel, /beforeRunFingerprint/);
  assert.match(panel, /traceRequestId:/);
  const css = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
  assert.match(css, /\.sim-improvement-actions \{ display: grid;/);
  assert.match(css, /\.sim-improvement-metrics, \.sim-improvement-actions \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
