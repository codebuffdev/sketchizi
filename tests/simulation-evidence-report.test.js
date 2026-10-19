import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationEvidenceReport, SIMULATION_EVIDENCE_REPORT_SCHEMA_VERSION } from "../src/features/simulation/experiments/simulationEvidenceReport.js";

const sample = {
  status: "completed",
  provenance: { modelFingerprint: "model-1", engineVersion: "0.6.0" },
  interpretation: "Synthetic only.",
  baseline: { status: "completed", metrics: { offeredRequests: 100, successfulRequests: 95, failedRequests: 5, droppedRequests: 0, throughputRps: 9.5, successfulLatencyMs: { p95: 20 } }, failedRatePercent: 5, p95LatencyMs: 20, result: { hugeInternalTrace: true } },
  scenarios: [{ id: "a::b", name: "API + DB", status: "completed", metrics: { throughputRps: 2, successfulLatencyMs: { p95: 80 } }, throughputLossPercent: 78, strongestIndividualLossPercent: 50, additionalLossPercent: 28, interaction: "worse-than-either-alone", targets: [{ id: "a", name: "API", kind: "backend.rest-service" }, { id: "b", name: "DB", kind: "data.postgresql-database" }], result: { hugeInternalTrace: true } }],
  diagnostics: [{ code: "NOTE", severity: "info", title: "Note", message: "Synthetic", entityIds: ["a"], relationIds: [] }],
  sourceModelSnapshot: { modelRevision: 4 },
  profileUsed: { schemaVersion: 1 },
};

test("evidence report preserves provenance, assumptions, metrics, targets, and diagnostics", () => {
  const artifact = createSimulationEvidenceReport({ experimentType: "failure-chain-matrix", results: sample });
  assert.equal(artifact.filename, "sketchizi-failure-chain-matrix-evidence.json");
  assert.equal(artifact.mimeType, "application/json;charset=utf-8");
  const parsed = JSON.parse(artifact.text);
  assert.equal(parsed.schemaVersion, SIMULATION_EVIDENCE_REPORT_SCHEMA_VERSION);
  assert.equal(parsed.provenance.modelFingerprint, "model-1");
  assert.equal(parsed.baseline.metrics.p95LatencyMs, 20);
  assert.equal(parsed.scenarios[0].additionalLossPercent, 28);
  assert.deepEqual(parsed.scenarios[0].targets.map((target) => target.id), ["a", "b"]);
  assert.equal(parsed.diagnostics[0].code, "NOTE");
  assert.deepEqual(parsed.sourceModelSnapshot, { modelRevision: 4 });
  assert.deepEqual(parsed.profileUsed, { schemaVersion: 1 });
});

test("evidence report excludes engine run objects and declares interpretation limits", () => {
  const parsed = JSON.parse(createSimulationEvidenceReport({ experimentType: "resilience matrix", results: sample }).text);
  assert.equal(parsed.baseline.result, undefined);
  assert.equal(parsed.scenarios[0].result, undefined);
  assert.equal(parsed.limitations.length, 3);
  assert.match(parsed.limitations[0], /not live telemetry/);
  assert.match(parsed.limitations[1], /unmodeled recovery/);
});

test("evidence report rejects missing experiment type or results", () => {
  assert.throws(() => createSimulationEvidenceReport({ results: sample }), /experimentType is required/);
  assert.throws(() => createSimulationEvidenceReport({ experimentType: "test" }), /Experiment results are required/);
});
