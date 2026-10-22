import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createArchitectureDecisionRecord,
  formatArchitectureDecisionRecordMarkdown,
  updateArchitectureDecisionRecord,
} from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import {
  buildRolloutReadiness,
  createDefaultRolloutChecks,
  normalizeRolloutChecks,
} from "../src/features/simulation/experiments/rolloutReadiness.js";

const report = (overrides = {}) => ({
  title: "Architecture Decision Report",
  baselineName: "Baseline A",
  proposedName: "Proposed B",
  decision: "Promising simulation result — proceed to validation",
  rationale: "Comparable model runs show lower p95 latency.",
  confidence: "Low — modeled evidence only",
  changeStatus: "changed",
  changeCount: 2,
  counts: { addedComponents: 1, removedComponents: 0, modifiedComponents: 1, addedRelationships: 0, removedRelationships: 0, modifiedRelationships: 0 },
  simulationStatus: "comparable",
  simulationReason: "Matching profile and scope.",
  metrics: [{ key: "p95LatencyMs", label: "p95 latency", before: 230, after: 180, delta: -50, direction: "improved" }],
  changes: [{ action: "Modified", subjectType: "Component", label: "API", detail: "properties.concurrency" }],
  bottlenecks: [],
  recommendations: [],
  portfolio: [],
  risks: [],
  nextSteps: ["Review the proposed architecture.", "Run a production-like load test."],
  limitations: ["Simulation is not production evidence."],
  profileConfirmed: true,
  loadTestRecordsCount: 1,
  ...overrides,
});

function fullyCheckedRecord() {
  let record = createArchitectureDecisionRecord({
    report: report(),
    id: "adr-rollout-complete",
    owner: "Platform team",
    rationale: "Proceed after production checks and independent rollout review.",
    status: "accepted",
    createdAt: "2026-10-19T10:00:00.000Z",
    validationGates: [{ id: "gate-1", label: "Review semantic change", done: true }],
  });
  const rolloutChecks = createDefaultRolloutChecks().map((check) => ({
    ...check,
    done: true,
    evidence: `Evidence recorded for ${check.id}`,
    completedAt: "2026-10-19T12:00:00.000Z",
  }));
  record = updateArchitectureDecisionRecord(record, { rolloutChecks }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  return record;
}

test("creates a fixed required rollout checklist with evidence fields", () => {
  const checks = createDefaultRolloutChecks();
  assert.equal(checks.length, 7);
  assert.ok(checks.some((check) => check.id === "production-load-test"));
  assert.ok(checks.every((check) => check.done === false && check.evidence === "" && check.completedAt === null));
});

test("normalizes legacy or malformed checklist content to known required checks", () => {
  const normalized = normalizeRolloutChecks([
    { id: "production-load-test", done: true, evidence: "  LOAD-42  ", completedAt: "2026-10-19T10:00:00.000Z" },
    { id: "unknown-check", done: true, evidence: "not allowed" },
  ]);
  assert.equal(normalized.length, 7);
  assert.equal(normalized[0].evidence, "LOAD-42");
  assert.equal(normalized[0].done, true);
  assert.equal(normalized.some((check) => check.id === "unknown-check"), false);
});

test("keeps proposed records not ready and explains missing production evidence", () => {
  const record = createArchitectureDecisionRecord({ report: report({ loadTestRecordsCount: 0, profileConfirmed: false }), id: "adr-not-ready" });
  const readiness = buildRolloutReadiness(record);
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.checks.some((check) => check.id === "decision-status" && check.state === "pending"));
  assert.ok(readiness.checks.some((check) => check.id === "load-test-record-present" && check.state === "blocked"));
  assert.ok(readiness.checks.some((check) => check.id === "profile-confirmation" && check.state === "blocked"));
  assert.match(readiness.disclaimer, /does not authorize deployment/i);
});

test("even a fully checked accepted record requires a separate human rollout approval", () => {
  const readiness = buildRolloutReadiness(fullyCheckedRecord());
  assert.equal(readiness.status, "review-required");
  assert.equal(readiness.outstandingCount, 0);
  assert.equal(readiness.completeCount, readiness.totalCount);
  assert.match(readiness.label, /final rollout approval is still required/i);
  assert.match(readiness.disclaimer, /separately approve the rollout/i);
});

test("rejects rollout readiness when architecture comparison evidence is missing or mismatched", () => {
  const record = createArchitectureDecisionRecord({
    report: report({ simulationStatus: "context-mismatch", metrics: [] }),
    status: "accepted",
    owner: "Platform team",
    rationale: "Needs more evidence.",
    id: "adr-context-mismatch",
  });
  const readiness = buildRolloutReadiness(record);
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.checks.some((check) => check.id === "simulation-evidence" && check.state === "blocked"));
});

test("rejected proposal cannot be rollout-ready even if every other check is complete", () => {
  const record = updateArchitectureDecisionRecord(fullyCheckedRecord(), { status: "rejected" });
  const readiness = buildRolloutReadiness(record);
  assert.equal(readiness.status, "blocked");
  assert.match(readiness.label, /decision is rejected/i);
  assert.ok(readiness.checks.some((check) => check.id === "decision-status" && check.state === "blocked"));
});

test("manual production checks require an evidence note as well as a checked state", () => {
  const record = fullyCheckedRecord();
  const rolloutChecks = record.rolloutChecks.map((check) => check.id === "observability" ? { ...check, evidence: "", completedAt: null } : check);
  const updated = updateArchitectureDecisionRecord(record, { rolloutChecks });
  const readiness = buildRolloutReadiness(updated);
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.checks.some((check) => check.id === "production-observability" && check.state === "blocked"));
});

test("rollout checklist updates persist in the record and append an audit event", () => {
  const record = createArchitectureDecisionRecord({ report: report(), id: "adr-check-audit" });
  const check = record.rolloutChecks.find((entry) => entry.id === "rollback-plan");
  const updated = updateArchitectureDecisionRecord(record, {
    rolloutChecks: record.rolloutChecks.map((entry) => entry.id === check.id ? { ...entry, evidence: "Runbook change CHG-481", done: true } : entry),
  }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  const saved = updated.rolloutChecks.find((entry) => entry.id === check.id);
  assert.equal(saved.done, true);
  assert.equal(saved.evidence, "Runbook change CHG-481");
  assert.equal(saved.completedAt, "2026-10-19T12:00:00.000Z");
  assert.ok(updated.auditTrail.some((event) => event.type === "rollout-check-updated" && /completed with evidence/.test(event.message)));
  assert.equal(record.rolloutChecks.find((entry) => entry.id === check.id).done, false);
});

test("Markdown record export includes readiness status, evidence references, and rollout disclaimer", () => {
  const record = fullyCheckedRecord();
  const markdown = formatArchitectureDecisionRecordMarkdown(record);
  assert.match(markdown, /## Rollout readiness/);
  assert.match(markdown, /Checklist complete — final rollout approval is still required/);
  assert.match(markdown, /Evidence recorded for production-load-test/);
  assert.match(markdown, /does not authorize deployment/i);
});

test("decision panel exposes an evidence-backed readiness checklist and persists checklist updates", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Rollout readiness checklist/);
  assert.match(panel, /Evidence note \/ ticket \/ test run reference/);
  assert.match(panel, /saveRolloutCheck/);
  assert.match(panel, /buildRolloutReadiness/);
});
