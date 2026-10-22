import test from "node:test";
import assert from "node:assert/strict";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecord } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildRolloutReadiness } from "../src/features/simulation/experiments/rolloutReadiness.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";
import { buildRemediationWorkQueue, filterRemediationWorkQueue } from "../src/features/simulation/experiments/remediationWorkQueue.js";
import {
  acknowledgeRemediationWorkQueueEscalation,
  recordRemediationWorkQueueFollowUpNote,
  reopenRemediationWorkQueueTask,
  resolveRemediationWorkQueueTask,
  updateRemediationWorkQueueTask,
} from "../src/features/simulation/experiments/remediationWorkQueueMetadata.js";
import { mergeReleaseBundleReviewFindings } from "../src/features/simulation/experiments/reviewFindingTracking.js";

const NOW = "2026-10-20T10:00:00.000Z";
const report = {
  title: "Task follow-up fixture", baselineName: "Baseline", proposedName: "Proposed",
  decision: "Insufficient evidence", rationale: "Fixture only", confidence: "Low",
  changeStatus: "changed", changeCount: 1, changes: [], simulationStatus: "unavailable",
  simulationReason: "No comparable simulation", metrics: [], risks: [], limitations: [], nextSteps: [],
  profileConfirmed: false, loadTestRecordsCount: 0,
};

function makeRecord(id = "adr-follow-up", severity = "error") {
  const created = createArchitectureDecisionRecord({ report, id, createdAt: "2026-10-18T10:00:00.000Z" });
  const merged = mergeReleaseBundleReviewFindings([], {
    sourceName: "release-0.98.json",
    bundleMetadata: { recordId: "bundle-98", generatedAt: "2026-10-18T09:00:00.000Z" },
    findings: [{ code: "FOLLOW-UP-1", severity, title: "Investigate timeout errors", detail: "Timeouts remain above the target." }],
  });
  return updateArchitectureDecisionRecord(created, { reviewFindings: merged.findings }, { updatedAt: "2026-10-18T10:01:00.000Z" });
}

function firstTask(record, now = NOW) {
  const queue = buildRemediationWorkQueue([record], { now });
  return queue.items.find((item) => item.kind === "rollout-blocker") || queue.items[0];
}

function saveTasks(record, tasks) {
  return updateArchitectureDecisionRecord(record, { workQueueTasks: tasks }, { updatedAt: NOW });
}

test("overdue blocker acknowledgement requires author and note, is auditable, and is invalidated by changed due date", () => {
  let record = makeRecord();
  let task = firstTask(record);
  let schedule = updateRemediationWorkQueueTask(record.workQueueTasks, task.id, { assignee: "SRE", dueDate: "2026-10-19" }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  record = saveTasks(record, schedule.tasks);
  task = firstTask(record);
  assert.equal(task.isEscalationCandidate, true);
  assert.equal(task.isEscalationAcknowledged, false);
  assert.throws(() => acknowledgeRemediationWorkQueueEscalation(record.workQueueTasks, task.id, {
    acknowledgedBy: "On-call", note: "", fingerprint: task.escalationFingerprint, dueDateSnapshot: task.dueDate,
  }, { updatedAt: NOW }), /follow-up note/i);
  const acknowledged = acknowledgeRemediationWorkQueueEscalation(record.workQueueTasks, task.id, {
    acknowledgedBy: "On-call", note: "Escalated to the API owner; investigate before the next release.",
    fingerprint: task.escalationFingerprint, dueDateSnapshot: task.dueDate,
  }, { updatedAt: NOW });
  record = saveTasks(record, acknowledged.tasks);
  task = firstTask(record);
  let queue = buildRemediationWorkQueue([record], { now: NOW });
  assert.equal(task.isEscalationAcknowledged, true);
  assert.equal(queue.escalationSummary.acknowledgedCount, 1);
  assert.equal(queue.escalationSummary.unacknowledgedCount, 0);
  assert.equal(filterRemediationWorkQueue(queue.items, "unacknowledged-escalations").length, 0);
  assert.equal(task.escalationAcknowledgement.acknowledgedBy, "On-call");
  assert.ok(task.taskAuditTrail.some((event) => event.type === "escalation-acknowledged"));
  assert.ok(task.followUpNotes.some((note) => note.type === "escalation-acknowledgement"));

  const changedDueDate = updateRemediationWorkQueueTask(record.workQueueTasks, task.id, { dueDate: "2026-10-18" }, { updatedAt: "2026-10-20T11:00:00.000Z" });
  record = saveTasks(record, changedDueDate.tasks);
  queue = buildRemediationWorkQueue([record], { now: NOW });
  task = queue.items.find((item) => item.id === task.id);
  assert.equal(task.isEscalationAcknowledged, false);
  assert.equal(task.isEscalationAcknowledgementStale, true);
  assert.equal(queue.unacknowledgedOverdueBlockingCount, 1);
  assert.equal(record.reviewFindings[0].status, "open");
});

test("follow-up notes are persisted separately from canonical finding and evidence", () => {
  const record = makeRecord();
  const task = firstTask(record);
  const note = recordRemediationWorkQueueFollowUpNote(record.workQueueTasks, task.id, {
    author: "Release lead", note: "Run a targeted timeout regression after the pool-size change.",
  }, { updatedAt: NOW });
  const saved = saveTasks(record, note.tasks);
  const currentTask = firstTask(saved);
  assert.equal(currentTask.followUpNotes.length, 1);
  assert.equal(currentTask.followUpNotes[0].author, "Release lead");
  assert.ok(currentTask.taskAuditTrail.some((event) => event.type === "task-follow-up-noted"));
  assert.equal(saved.reviewFindings[0].status, "open");
  assert.equal(saved.reviewFindings[0].evidence, record.reviewFindings[0].evidence);
  assert.throws(() => recordRemediationWorkQueueFollowUpNote(saved.workQueueTasks, task.id, { author: "Reviewer", note: "  " }, { updatedAt: NOW }), /follow-up note/i);
});

test("resolving a queue task preserves the open error finding as a rollout blocker and can be reopened", () => {
  const record = makeRecord();
  const task = firstTask(record);
  const resolution = resolveRemediationWorkQueueTask(record.workQueueTasks, task.id, {
    resolvedBy: "SRE", note: "The follow-up ticket is complete; finding review remains separate.",
    evidenceReference: "ticket://OPS-44", fingerprint: task.lifecycleFingerprint,
  }, { updatedAt: NOW });
  const saved = saveTasks(record, resolution.tasks);
  const queue = buildRemediationWorkQueue([saved], { now: NOW });
  assert.equal(queue.items.some((item) => item.id === task.id), false);
  assert.equal(queue.resolvedItems.some((item) => item.id === task.id), true);
  assert.equal(queue.totalResolvedCount, 1);
  assert.equal(queue.resolvedOpenBlockerCount, 1);
  assert.equal(filterRemediationWorkQueue(queue.items, "resolved", { resolvedItems: queue.resolvedItems }).length, 1);
  assert.equal(saved.reviewFindings[0].status, "open", "task resolution never mutates the canonical finding disposition");
  assert.equal(buildRolloutReadiness(saved).status, "blocked", "the open error finding remains a rollout blocker");

  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [], generatedAt: NOW });
  assert.equal(bundle.remediationWorkQueue.resolvedTaskCount, 1);
  assert.equal(bundle.remediationWorkQueue.resolvedTasks[0].taskResolution.evidenceReference, "ticket://OPS-44");
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /queue task\(s\) have been marked resolved while the underlying error finding remains open/i.test(risk)));
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "follow-up-release.json" });
  assert.equal(review.findings.some((finding) => finding.code.startsWith("work-queue-resolved-") || finding.code === "work-queue-active-resolved-overlap"), false,
    JSON.stringify(review.findings.filter((finding) => finding.code.startsWith("work-queue-resolved-") || finding.code === "work-queue-active-resolved-overlap")));

  const reopened = reopenRemediationWorkQueueTask(saved.workQueueTasks, task.id, {
    reopenedBy: "Release lead", note: "Need a follow-up evidence attachment before this task can be closed.",
  }, { updatedAt: "2026-10-20T12:00:00.000Z" });
  const reopenedRecord = saveTasks(saved, reopened.tasks);
  const reopenedQueue = buildRemediationWorkQueue([reopenedRecord], { now: NOW });
  const activeAgain = reopenedQueue.items.find((item) => item.id === task.id);
  assert.ok(activeAgain);
  assert.equal(reopenedQueue.totalResolvedCount, 0);
  assert.equal(activeAgain.taskResolution.status, "open");
  assert.equal(activeAgain.resolutionHistory.length, 1);
  assert.ok(activeAgain.taskAuditTrail.some((event) => event.type === "task-reopened"));
  assert.equal(reopenedRecord.reviewFindings[0].status, "open");
});

test("a changed task lifecycle fingerprint makes a previous resolution stale and active again", () => {
  let record = makeRecord("adr-stale-resolution", "warning");
  let task = firstTask(record);
  const resolution = resolveRemediationWorkQueueTask(record.workQueueTasks, task.id, {
    resolvedBy: "Reviewer", note: "Completed the warning follow-up.", fingerprint: task.lifecycleFingerprint,
  }, { updatedAt: NOW });
  record = saveTasks(record, resolution.tasks);
  const changedFindings = record.reviewFindings.map((finding) => ({ ...finding, severity: "info" }));
  record = updateArchitectureDecisionRecord(record, { reviewFindings: changedFindings }, { updatedAt: "2026-10-20T12:00:00.000Z" });
  const queue = buildRemediationWorkQueue([record], { now: NOW });
  const stale = queue.items.find((item) => item.id === task.id);
  assert.ok(stale);
  assert.equal(stale.taskResolutionStale, true);
  assert.equal(stale.isTaskResolved, false);
});

test("panel and export expose acknowledgement, follow-up notes, task resolution, and separate canonical finding status", async () => {
  const { readFile } = await import("node:fs/promises");
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const markdownSource = await readFile(new URL("../src/features/simulation/experiments/architectureDecisionRecord.js", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../src/features/simulation/experiments/releaseEvidenceBundle.js", import.meta.url), "utf8");
  assert.match(panel, /Acknowledge escalation/);
  assert.match(panel, /Add follow-up note/);
  assert.match(panel, /Mark task resolved/);
  assert.match(panel, /Reopen queue task/);
  assert.match(panel, /does not change the canonical finding disposition/);
  assert.match(markdownSource, /Task-level resolution status/);
  assert.match(markdownSource, /Follow-up notes/);
  assert.match(exportSource, /resolvedTasks: remediationQueue\.resolvedItems/);
  assert.match(exportSource, /unacknowledgedEscalationCount/);
});
