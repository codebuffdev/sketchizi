import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRemediationWorkQueue, filterRemediationWorkQueue } from "../src/features/simulation/experiments/remediationWorkQueue.js";
import { mergeReleaseBundleReviewFindings, recordRemediationVerificationRun, recordRemediationSourceDriftResolution, updateTrackedReviewFinding } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecords } from "../src/features/simulation/experiments/architectureDecisionRecord.js";

const loadTestRecords = [
  { id: "before-1", name: "Before run", testedAt: "2026-10-01", targetEnvironment: "staging", source: "k6", schemaVersion: 1, workload: { offeredRps: 100, durationSeconds: 60, concurrency: 20 }, observed: { p95LatencyMs: 300, throughputRps: 80, errorRatePercent: 4 } },
  { id: "after-1", name: "After run", testedAt: "2026-10-02", targetEnvironment: "staging", source: "k6", schemaVersion: 1, workload: { offeredRps: 100, durationSeconds: 60, concurrency: 20 }, observed: { p95LatencyMs: 180, throughputRps: 125, errorRatePercent: 0.5 } },
];
const report = { title: "Queue fixture", baselineName: "Before", proposedName: "After", simulationStatus: "comparable", metrics: [], loadTestRecordsCount: 2, profileConfirmed: true, changeStatus: "changed", changeCount: 1 };
function makeRecord(id, reviewFindings) {
  const record = createArchitectureDecisionRecord({ id, report, createdAt: "2026-10-05T10:00:00.000Z" });
  return updateArchitectureDecisionRecords([record], id, { reviewFindings })[0];
}
function importedFinding({ id, code, severity = "warning", title = "Sample finding", detail = "A tracked issue" } = {}) {
  const review = { sourceName: "fixture.json", bundleMetadata: { recordId: "source-bundle", generatedAt: "2026-10-03T10:00:00.000Z" }, findings: [{ code, severity, title, detail }] };
  const merged = mergeReleaseBundleReviewFindings([], review);
  if (id) merged.findings[0].id = id;
  return merged.findings[0];
}
function resolved(finding) {
  return updateTrackedReviewFinding([finding], finding.id, { status: "resolved", owner: "Platform", rationale: "Patch applied.", evidence: "CI run 123" }).finding;
}

const measurementSources = {
  p95LatencyMs: {
    before: { sourceType: "load-test-record", sourceRecordId: "before-1" },
    after: { sourceType: "load-test-record", sourceRecordId: "after-1" },
  },
};

test("builds a prioritized queue across separate decision records and flags error blockers", () => {
  const warning = importedFinding({ code: "WARN-1" });
  const error = importedFinding({ code: "ERR-1", severity: "error", title: "Critical error" });
  const records = [makeRecord("adr-a", [warning]), makeRecord("adr-b", [error])];
  const queue = buildRemediationWorkQueue(records, { loadTestRecords });
  assert.equal(queue.recordCount, 2);
  assert.equal(queue.trackedFindingCount, 2);
  assert.ok(queue.items.length >= 2);
  assert.equal(queue.items[0].priority, "blocking");
  assert.equal(queue.items[0].recordId, "adr-b");
  assert.ok(queue.items.some((item) => item.kind === "rollout-blocker" && item.findingCode === "ERR-1" && item.blocksRollout));
  assert.equal(filterRemediationWorkQueue(queue.items, "blocking").every((item) => item.blocksRollout), true);
});

test("shows a recurrence review before requesting a new verification run", () => {
  const closed = resolved(importedFinding({ code: "REC-1", severity: "error", title: "Reappearing finding" }));
  closed.reoccurrence = { state: "unreviewed", detectedAt: "2026-10-04T10:00:00.000Z", sourceBundleName: "release-2.json", previousStatus: "resolved", reviewedAt: null };
  const queue = buildRemediationWorkQueue([makeRecord("adr-recurrence", [closed])], { loadTestRecords });
  assert.equal(queue.items.filter((item) => item.kind === "recurrence-review").length, 1);
  assert.equal(queue.items.filter((item) => item.kind === "re-verification").length, 0, "reopening/evidence review precedes the next verification run");
  assert.equal(queue.items.find((item) => item.kind === "recurrence-review").blocksRollout, true);
});

test("queues material source drift with a direct original/current comparison target", () => {
  const start = resolved(importedFinding({ code: "DRIFT-1", severity: "error", title: "p95 regression" }));
  const run = recordRemediationVerificationRun([start], start.id, {
    runType: "load-test", outcome: "pass", beforeState: "p95 300ms", afterState: "p95 180ms", summary: "Compare source load tests.", evidence: "run-123", recordedBy: "Engineer",
    measurements: { p95LatencyMs: { before: 300, after: 180 } }, measurementSources,
  }, { updatedAt: "2026-10-04T11:00:00.000Z", loadTestRecords });
  const changedRecords = structuredClone(loadTestRecords);
  changedRecords[0].observed.p95LatencyMs = 275;
  const decision = makeRecord("adr-drift", run.findings);
  const queue = buildRemediationWorkQueue([decision], { loadTestRecords: changedRecords });
  const drift = queue.items.find((item) => item.kind === "source-drift-review");
  assert.ok(drift);
  assert.equal(drift.blocksRollout, true);
  assert.equal(drift.runId, run.run.id);
  assert.equal(drift.metricKey, "p95LatencyMs");
  assert.equal(drift.side, "before");
  assert.ok(drift.fingerprint);
  assert.match(drift.reason, /saved verification snapshot/i);
  assert.equal(filterRemediationWorkQueue(queue.items, "source-drift-review").length, 1, "only the changed before mapping needs review; the unchanged after mapping is not queued");
});

test("reviewed material drift moves to re-verification rather than disappearing from the queue", () => {
  const start = resolved(importedFinding({ code: "DRIFT-2", severity: "warning", title: "p95 regression" }));
  const run = recordRemediationVerificationRun([start], start.id, {
    runType: "load-test", outcome: "pass", beforeState: "p95 300ms", afterState: "p95 180ms", summary: "Compare source load tests.", evidence: "run-124", recordedBy: "Engineer",
    measurements: { p95LatencyMs: { before: 300, after: 180 } }, measurementSources,
  }, { updatedAt: "2026-10-04T12:00:00.000Z", loadTestRecords });
  const changedRecords = structuredClone(loadTestRecords);
  changedRecords[0].observed.p95LatencyMs = 270;
  const initialQueue = buildRemediationWorkQueue([makeRecord("adr-drift-review", run.findings)], { loadTestRecords: changedRecords });
  const drift = initialQueue.items.find((item) => item.kind === "source-drift-review");
  assert.ok(drift);
  const reviewed = recordRemediationSourceDriftResolution(run.findings, start.id, run.run.id, drift.metricKey, drift.side, {
    disposition: "requires-reverification", reviewer: "Reviewer", rationale: "Source value changed; take a fresh run.",
  }, { updatedAt: "2026-10-04T12:05:00.000Z", loadTestRecords: changedRecords });
  const queue = buildRemediationWorkQueue([makeRecord("adr-drift-review", reviewed.findings)], { loadTestRecords: changedRecords });
  assert.ok(queue.items.some((item) => item.kind === "re-verification" && item.metricKey === drift.metricKey && item.side === drift.side));
  assert.equal(queue.items.some((item) => item.kind === "source-drift-review" && item.metricKey === drift.metricKey && item.side === drift.side), false);
});

test("resolved findings with a passing run awaiting confirmation enter the reviewer-confirmation queue", () => {
  const finding = resolved(importedFinding({ code: "CONFIRM-1", severity: "error" }));
  const recorded = recordRemediationVerificationRun([finding], finding.id, {
    runType: "regression-test", outcome: "pass", beforeState: "issue reproduces", afterState: "issue absent", summary: "Regression test passed.", evidence: "ci://run/123", recordedBy: "Engineer",
  }, { updatedAt: "2026-10-04T13:00:00.000Z" });
  const queue = buildRemediationWorkQueue([makeRecord("adr-confirm", recorded.findings)], { loadTestRecords: [] });
  const item = queue.items.find((entry) => entry.kind === "reviewer-confirmation");
  assert.ok(item);
  assert.equal(item.runId, recorded.run.id);
  assert.equal(item.blocksRollout, true);
});

test("already accepted display-name-only source drift does not remain queued as new work", () => {
  const finding = resolved(importedFinding({ code: "CONTEXT-1", severity: "warning" }));
  const recorded = recordRemediationVerificationRun([finding], finding.id, {
    runType: "load-test", outcome: "pass", beforeState: "p95 300ms", afterState: "p95 180ms", summary: "Compare source load tests.", evidence: "run-125", recordedBy: "Engineer",
    measurements: { p95LatencyMs: { before: 300, after: 180 } }, measurementSources,
  }, { updatedAt: "2026-10-04T14:00:00.000Z", loadTestRecords });
  const renamed = structuredClone(loadTestRecords);
  renamed[0].name = "Updated display name";
  const firstQueue = buildRemediationWorkQueue([makeRecord("adr-context", recorded.findings)], { loadTestRecords: renamed });
  const drift = firstQueue.items.find((item) => item.kind === "source-drift-review");
  assert.ok(drift);
  const reviewed = recordRemediationSourceDriftResolution(recorded.findings, finding.id, recorded.run.id, drift.metricKey, drift.side, {
    disposition: "acceptable-context", reviewer: "Reviewer", rationale: "Only the record display name changed.",
  }, { updatedAt: "2026-10-04T14:05:00.000Z", loadTestRecords: renamed });
  const queue = buildRemediationWorkQueue([makeRecord("adr-context", reviewed.findings)], { loadTestRecords: renamed });
  assert.equal(queue.items.some((item) => item.kind === "source-drift-review" && item.metricKey === drift.metricKey && item.side === drift.side), false);
});

test("queue filters are bounded to the requested action type and input is treated as read-only", () => {
  const finding = importedFinding({ code: "READONLY-1", severity: "error" });
  const records = [makeRecord("adr-readonly", [finding])];
  const before = structuredClone(records);
  const queue = buildRemediationWorkQueue(records, { loadTestRecords });
  assert.ok(filterRemediationWorkQueue(queue.items, "all").length > 0);
  assert.ok(filterRemediationWorkQueue(queue.items, "blocking").every((item) => item.blocksRollout));
  assert.ok(filterRemediationWorkQueue(queue.items, "source-drift-review").every((item) => item.kind === "source-drift-review"));
  assert.deepEqual(records, before, "queue derivation does not mutate decision records or historical findings");
});


test("decision panel renders a cross-record queue with filters and direct source-comparison navigation", async () => {
  const source = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
  assert.match(source, /aria-label="Remediation work queue"/);
  assert.match(source, /buildRemediationWorkQueue\(architectureDecisionRecords, \{ loadTestRecords \}\)/);
  assert.match(source, /filterRemediationWorkQueue\(remediationWorkQueue\.items, remediationWorkQueueFilter, \{ upcomingDeadlines: remediationWorkQueue\.upcomingDeadlines, resolvedItems: remediationWorkQueue\.resolvedItems \}\)/);
  assert.match(source, /data-review-finding-id=\{finding\.id\}/);
  assert.match(source, /data-remediation-drift-target=""/);
  assert.match(source, /openRemediationWorkItem\(item\)/);
  assert.match(source, /scrollIntoView/);
  assert.match(styles, /\.sim-remediation-work-queue/);
  assert.match(styles, /\.sim-remediation-source-drift-item\.is-work-queue-focus/);
});
