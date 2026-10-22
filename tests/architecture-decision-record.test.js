import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorkbenchExtension, readWorkbenchDocument, withWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";
import {
  ARCHITECTURE_DECISION_STATUSES,
  createArchitectureDecisionRecord,
  formatArchitectureDecisionRecordMarkdown,
  updateArchitectureDecisionRecord,
  updateArchitectureDecisionRecords,
} from "../src/features/simulation/experiments/architectureDecisionRecord.js";

const sampleReport = () => ({
  title: "Architecture Decision Report",
  baselineName: "Baseline A",
  proposedName: "Proposed B",
  decision: "Mixed simulation result — resolve trade-offs before adoption",
  rationale: "Throughput improved but p95 regressed.",
  confidence: "Low — modeled evidence only",
  changeStatus: "changed",
  changeCount: 2,
  counts: { addedComponents: 1, removedComponents: 0, modifiedComponents: 1, addedRelationships: 0, removedRelationships: 0, modifiedRelationships: 0 },
  simulationStatus: "comparable",
  simulationReason: "Matched profile and scope.",
  metrics: [{ key: "throughputRps", label: "Throughput", before: 100, after: 115, delta: 15, direction: "improved" }],
  changes: [{ action: "Modified", subjectType: "Component", label: "API", detail: "properties.concurrency" }],
  bottlenecks: [{ label: "API", peakUtilization: 0.9, queueWaitP95Ms: 15, maxDropped: 1, maxFailed: 0 }],
  traceEvidence: { label: "API", scenarioLabel: "Surge", requestOutcome: "success", durationMs: 25, serviceTimeMs: 20, queueWaitMs: 5 },
  recommendations: [{ label: "Test capacity", interventionKind: "capacity", reason: "Queueing observed" }],
  portfolio: [{ rank: 1, label: "Capacity +20%", interventionKind: "capacity", score: 8.2, outcome: "promising" }],
  risks: ["p95 latency regressed."],
  nextSteps: ["Run a production-like load test.", "Review rollback plan."],
  limitations: ["Synthetic outputs are not production measurements."],
  profileConfirmed: false,
  loadTestRecordsCount: 0,
});

test("creates a point-in-time snapshot with validation gates and a created audit event", () => {
  const report = sampleReport();
  const record = createArchitectureDecisionRecord({ report, id: "adr-test-1", createdAt: "2026-10-19T10:00:00.000Z" });
  report.rationale = "Mutated later";
  assert.equal(record.id, "adr-test-1");
  assert.equal(record.status, "proposed");
  assert.equal(record.reportSnapshot.sourceRationale, "Throughput improved but p95 regressed.");
  assert.equal(record.validationGates.length, 2);
  assert.equal(record.validationGates.every((gate) => gate.done === false), true);
  assert.equal(record.auditTrail[0].type, "created");
  assert.equal(record.createdAt, record.updatedAt);
  assert.equal(record.reportSnapshot.metrics[0].after, 115);
});

test("creates only recognized initial statuses and bounds long fields", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), status: "arbitrary", owner: " x ".repeat(80), rationale: "r".repeat(3000), id: "adr-bounded" });
  assert.equal(record.status, "proposed");
  assert.equal(record.owner.length, 120);
  assert.equal(record.rationale.length, 2000);
  assert.deepEqual(ARCHITECTURE_DECISION_STATUSES.map((item) => item.value), ["proposed", "accepted", "rejected", "deferred"]);
});

test("records owner, rationale and status changes in the audit trail", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-review", createdAt: "2026-10-19T10:00:00.000Z" });
  const updated = updateArchitectureDecisionRecord(record, { owner: "Platform team", rationale: "Accept after canary validation.", status: "accepted" }, { updatedAt: "2026-10-19T11:00:00.000Z" });
  assert.equal(updated.owner, "Platform team");
  assert.equal(updated.rationale, "Accept after canary validation.");
  assert.equal(updated.status, "accepted");
  assert.equal(updated.updatedAt, "2026-10-19T11:00:00.000Z");
  assert.equal(updated.auditTrail.length, 4);
  assert.ok(updated.auditTrail.some((event) => /proposed to accepted/.test(event.message)));
  assert.ok(updated.auditTrail.some((event) => event.type === "owner-updated"));
  assert.ok(updated.auditTrail.some((event) => event.type === "rationale-updated"));
  assert.equal(record.status, "proposed", "updates must not mutate the original record");
});

test("tracks validation gate completion and re-opening with completion timestamps", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-gates", createdAt: "2026-10-19T10:00:00.000Z" });
  const completed = updateArchitectureDecisionRecord(record, { validationGates: record.validationGates.map((gate, index) => index === 0 ? { ...gate, done: true } : gate) }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  assert.equal(completed.validationGates[0].done, true);
  assert.equal(completed.validationGates[0].completedAt, "2026-10-19T12:00:00.000Z");
  const reopened = updateArchitectureDecisionRecord(completed, { validationGates: completed.validationGates.map((gate, index) => index === 0 ? { ...gate, done: false } : gate) }, { updatedAt: "2026-10-19T13:00:00.000Z" });
  assert.equal(reopened.validationGates[0].done, false);
  assert.equal(reopened.validationGates[0].completedAt, null);
  assert.ok(reopened.auditTrail.some((event) => /completed/.test(event.message)));
  assert.ok(reopened.auditTrail.some((event) => /open/.test(event.message)));
});

test("rejects unknown statuses and malformed validation gates", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-invalid" });
  assert.throws(() => updateArchitectureDecisionRecord(record, { status: "approved-ish" }), /Unsupported decision status/);
  assert.throws(() => updateArchitectureDecisionRecord(record, { validationGates: "not-an-array" }), /must be an array/);
  assert.throws(() => updateArchitectureDecisionRecord(record, { validationGates: [{ id: "empty", label: "   " }] }), /cannot be empty/);
});

test("caps audit history at 50 events and does not update timestamp for a no-op", () => {
  let record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-audit" });
  for (let index = 0; index < 70; index += 1) {
    record = updateArchitectureDecisionRecord(record, { rationale: `Reason ${index}` }, { updatedAt: `2026-10-19T10:${String(index % 60).padStart(2, "0")}:00.000Z` });
  }
  assert.equal(record.auditTrail.length, 50);
  const before = record.updatedAt;
  const noOp = updateArchitectureDecisionRecord(record, { rationale: record.rationale }, { updatedAt: "2026-10-19T23:00:00.000Z" });
  assert.equal(noOp.updatedAt, before);
  assert.equal(noOp.auditTrail.length, 50);
});

test("updates a record within the persisted collection and errors for an unknown id", () => {
  const a = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-a" });
  const b = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-b" });
  const records = updateArchitectureDecisionRecords([a, b], "adr-b", { status: "deferred" }, { updatedAt: "2026-10-19T15:00:00.000Z" });
  assert.equal(records[0], a);
  assert.equal(records[1].status, "deferred");
  assert.throws(() => updateArchitectureDecisionRecords([a], "missing", { status: "accepted" }), /not found/);
});

test("decision records survive a Workbench document extension save/load round trip", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-round-trip", owner: "Platform", rationale: "Defer for validation." });
  const workbench = createWorkbenchExtension({
    activeViewId: "system",
    views: [{ id: "system", label: "System", description: "System architecture" }],
    entities: [],
    relations: [],
    viewScenes: {},
  });
  workbench.decisionRecords = [record];
  const saved = withWorkbenchExtension({}, workbench);
  const loaded = readWorkbenchDocument({ elements: [], appState: {}, files: {}, extensions: saved });
  assert.deepEqual(loaded.workbench.decisionRecords, [record]);
  assert.equal(loaded.workbench.decisionRecords[0].reportSnapshot.recommendation, sampleReport().decision);
});

test("Markdown export contains the review decision, evidence, gates and rollout disclaimer", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-export", owner: "Runtime team", rationale: "Defer until the tail-latency issue is resolved." });
  const markdown = formatArchitectureDecisionRecordMarkdown(record);
  assert.match(markdown, /# Proposed B decision/);
  assert.match(markdown, /\*\*Owner:\*\* Runtime team/);
  assert.match(markdown, /Defer until the tail-latency issue is resolved/);
  assert.match(markdown, /## Simulation metric snapshot/);
  assert.match(markdown, /## Validation gates/);
  assert.match(markdown, /Outstanding gates:\*\* 2/);
  assert.match(markdown, /not proof that outstanding validation gates have passed/i);
});

test("panel includes create, update, gate tracking, export, and document-persistence callback", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(panel, /Create decision record from report/);
  assert.match(panel, /Save record changes/);
  assert.match(panel, /Record an owner and rationale before accepting or rejecting/);
  assert.match(panel, /Validation gates/);
  assert.match(panel, /Export decision record \(\.md\)/);
  assert.match(panel, /onUpdateArchitectureDecisionRecords/);
  assert.match(controller, /decisionRecords: structuredClone\(records\)/);
  assert.match(app, /onUpdateArchitectureDecisionRecords=\{workbenchController\.updateArchitectureDecisionRecords\}/);
});
