import test from "node:test";
import assert from "node:assert/strict";
import { compareSimulationEvidenceReports, parseSimulationEvidenceReport } from "../src/features/simulation/experiments/simulationEvidenceComparison.js";

const report = (overrides = {}) => ({
  reportType: "sketchizi-workbench-simulation-evidence",
  schemaVersion: 1,
  experimentType: "traffic-sweep",
  status: "completed",
  provenance: { modelRevision: 3, modelFingerprint: "model-a", profileFingerprint: "profile-a", engineVersion: "0.6.0" },
  assumptions: { trafficMultiplier: 5 },
  points: [{ multiplier: 1, label: "1× traffic", metrics: { throughputRps: 10, p95LatencyMs: 20 }, p95LatencyMs: 20, failedRatePercent: 1 }],
  ...overrides,
});

test("parses valid Workbench evidence and rejects malformed or unsupported reports", () => {
  assert.equal(parseSimulationEvidenceReport(JSON.stringify(report())).experimentType, "traffic-sweep");
  assert.throws(() => parseSimulationEvidenceReport("{"), /valid JSON/);
  assert.throws(() => parseSimulationEvidenceReport({ reportType: "other", schemaVersion: 1 }), /not a Sketchizi/);
  assert.throws(() => parseSimulationEvidenceReport(report({ schemaVersion: 99 })), /Unsupported evidence schema/);
});

test("compares matched rows with later-minus-earlier metric deltas", () => {
  const before = report();
  const after = report({ provenance: { ...before.provenance, modelRevision: 4 }, points: [{ multiplier: 1, label: "1× traffic", metrics: { throughputRps: 12, p95LatencyMs: 28 }, p95LatencyMs: 28, failedRatePercent: 3 }] });
  const comparison = compareSimulationEvidenceReports(before, after);
  assert.equal(comparison.rows[0].matched, true);
  assert.equal(comparison.rows[0].throughputDeltaRps, 2);
  assert.equal(comparison.rows[0].p95DeltaMs, 8);
  assert.equal(comparison.rows[0].failedRateDeltaPercentagePoints, 2);
  assert.equal(comparison.warnings.some((warning) => warning.includes("Model fingerprints differ")), false);
});

test("warns on model/profile/engine/assumption differences and lists unmatched scenarios", () => {
  const before = report();
  const after = report({
    experimentType: "resilience-matrix",
    provenance: { modelRevision: 4, modelFingerprint: "model-b", profileFingerprint: "profile-b", engineVersion: "0.7.0" },
    assumptions: { trafficMultiplier: 10 },
    scenarios: [{ id: "new", name: "New outage", metrics: { throughputRps: 2 } }],
    points: undefined,
  });
  const comparison = compareSimulationEvidenceReports(before, after);
  assert.ok(comparison.warnings.some((warning) => warning.includes("Experiment types differ")));
  assert.ok(comparison.warnings.some((warning) => warning.includes("Model fingerprints differ")));
  assert.ok(comparison.warnings.some((warning) => warning.includes("Profile fingerprints differ")));
  assert.ok(comparison.warnings.some((warning) => warning.includes("engine versions differ")));
  assert.ok(comparison.warnings.some((warning) => warning.includes("assumptions differ")));
  assert.equal(comparison.unmatchedRows.length, 1);
});

test("does not fabricate metric deltas for missing or null values", () => {
  const before = report({ points: [{ multiplier: 1, metrics: { throughputRps: 10 }, failedRatePercent: null }] });
  const after = report({ points: [{ multiplier: 1, metrics: { throughputRps: null }, failedRatePercent: 2 }] });
  const row = compareSimulationEvidenceReports(before, after).rows[0];
  assert.equal(row.throughputDeltaRps, null);
  assert.equal(row.p95DeltaMs, null);
  assert.equal(row.failedRateDeltaPercentagePoints, null);
});
