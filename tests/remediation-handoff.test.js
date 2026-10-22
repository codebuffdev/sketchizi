import test from "node:test";
import assert from "node:assert/strict";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecord, formatArchitectureDecisionRecordMarkdown } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildRemediationWorkQueue } from "../src/features/simulation/experiments/remediationWorkQueue.js";
import { acknowledgeRemediationWorkQueueEscalation, resolveRemediationWorkQueueTask, updateRemediationWorkQueueTask } from "../src/features/simulation/experiments/remediationWorkQueueMetadata.js";
import { appendRemediationHandoffNote, createRemediationHandoffActions, formatRemediationHandoffMarkdown, normalizeRemediationHandoffNotes, recordRemediationHandoffReceipt, reconcileRemediationHandoff, reviewRemediationHandoffClosure, updateRemediationHandoffAction, buildRemediationHandoffAccountabilityDashboard, evaluateRemediationHandoffEscalationPolicy, recordRemediationHandoffEscalationDecision, buildRemediationHandoffEscalationReviewQueue, recordRemediationHandoffEscalationReview, formatRemediationHandoffAccountabilityMarkdown, buildRemediationHandoffEscalationSlaMetrics, simulateRemediationHandoffEscalationPolicy } from "../src/features/simulation/experiments/remediationHandoff.js";
import { mergeReleaseBundleReviewFindings } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";

const NOW = "2026-10-20T10:00:00.000Z";
const report = {
  title: "Escalation handoff fixture", baselineName: "Baseline", proposedName: "Proposed",
  decision: "Insufficient evidence", rationale: "Fixture only", confidence: "Low",
  changeStatus: "changed", changeCount: 1, changes: [], simulationStatus: "unavailable",
  simulationReason: "No comparable simulation", metrics: [], risks: [], limitations: [], nextSteps: [],
  profileConfirmed: false, loadTestRecordsCount: 0,
};

function createRecord() {
  const base = createArchitectureDecisionRecord({ report, id: "adr-handoff-test", title: "Handoff decision", owner: "Release lead", createdAt: "2026-10-18T10:00:00.000Z" });
  const merged = mergeReleaseBundleReviewFindings([], {
    sourceName: "handoff-release.json",
    bundleMetadata: { recordId: "handoff-bundle", generatedAt: "2026-10-18T09:00:00.000Z" },
    findings: [
      { code: "ERR-HANDOFF", severity: "error", title: "API errors still block rollout", detail: "Error rate remains above target." },
      { code: "WARN-OVERDUE", severity: "warning", title: "Review cache timeout follow-up", detail: "Follow-up ticket remains open." },
      { code: "WARN-RESOLVED", severity: "warning", title: "Review connection pool follow-up", detail: "Queue task can close but finding still needs disposition." },
      { code: "INFO-OPEN", severity: "info", title: "Document operational ownership", detail: "Confirm handoff owner." },
    ],
  });
  return updateArchitectureDecisionRecord(base, { reviewFindings: merged.findings }, { updatedAt: "2026-10-18T10:01:00.000Z" });
}

function saveTaskUpdates(record, tasks) {
  return updateArchitectureDecisionRecord(record, { workQueueTasks: tasks }, { updatedAt: NOW });
}

function prepareRecord() {
  let record = createRecord();
  let queue = buildRemediationWorkQueue([record], { now: NOW });
  const errorTask = queue.items.find((item) => item.findingCode === "ERR-HANDOFF" && item.kind === "rollout-blocker");
  const overdueTask = queue.items.find((item) => item.findingCode === "WARN-OVERDUE");
  const resolvedTask = queue.items.find((item) => item.findingCode === "WARN-RESOLVED");
  let tasks = record.workQueueTasks;
  tasks = updateRemediationWorkQueueTask(tasks, errorTask.id, { assignee: "On-call", dueDate: "2026-10-17" }, { updatedAt: "2026-10-18T11:00:00.000Z" }).tasks;
  tasks = updateRemediationWorkQueueTask(tasks, overdueTask.id, { assignee: "Platform", dueDate: "2026-10-19" }, { updatedAt: "2026-10-18T11:01:00.000Z" }).tasks;
  tasks = updateRemediationWorkQueueTask(tasks, resolvedTask.id, { assignee: "DBA" }, { updatedAt: "2026-10-18T11:02:00.000Z" }).tasks;
  record = saveTaskUpdates(record, tasks);
  queue = buildRemediationWorkQueue([record], { now: NOW });
  const currentError = queue.items.find((item) => item.id === errorTask.id);
  const acknowledgement = acknowledgeRemediationWorkQueueEscalation(record.workQueueTasks, currentError.id, {
    acknowledgedBy: "Incident commander", note: "The on-call team owns the blocker; next shift should confirm the error-rate run.",
    fingerprint: currentError.escalationFingerprint, dueDateSnapshot: currentError.dueDate,
  }, { updatedAt: NOW });
  record = saveTaskUpdates(record, acknowledgement.tasks);
  queue = buildRemediationWorkQueue([record], { now: NOW });
  const currentResolvedTask = queue.items.find((item) => item.id === resolvedTask.id);
  const resolution = resolveRemediationWorkQueueTask(record.workQueueTasks, currentResolvedTask.id, {
    resolvedBy: "DBA", note: "The follow-up ticket was handed to the database owner; canonical finding remains open.",
    evidenceReference: "ticket://DB-82", fingerprint: currentResolvedTask.lifecycleFingerprint,
  }, { updatedAt: NOW });
  record = saveTaskUpdates(record, resolution.tasks);
  return { record, queue: buildRemediationWorkQueue([record], { now: NOW }) };
}

test("handoff summary categorizes acknowledged blockers, unresolved follow-ups, overdue tasks and resolved tasks with open findings", () => {
  const { record, queue } = prepareRecord();
  const summary = queue.handoffSummary;
  assert.equal(summary.asOfDate, "2026-10-20");
  assert.equal(summary.acknowledgedBlockers.count, 1);
  assert.equal(summary.acknowledgedBlockers.items[0].findingCode, "ERR-HANDOFF");
  assert.equal(summary.unresolvedFollowUps.count, 1);
  assert.equal(summary.unresolvedFollowUps.items[0].findingCode, "INFO-OPEN");
  assert.equal(summary.overdueTasks.count, 2);
  assert.equal(summary.resolvedTasksWithOpenFindings.count, 1);
  assert.equal(summary.resolvedTasksWithOpenFindings.items[0].findingCode, "WARN-RESOLVED");
  assert.equal(queue.resolvedOpenBlockerCount, 0, "the resolved warning task does not become an error blocker");
  assert.equal(record.reviewFindings.find((finding) => finding.code === "ERR-HANDOFF").status, "open");
  assert.equal(record.reviewFindings.find((finding) => finding.code === "WARN-RESOLVED").status, "open");
});

test("handoff note requires author and note and retains point-in-time queue counts and task references", () => {
  const { record, queue } = prepareRecord();
  assert.throws(() => appendRemediationHandoffNote([], { author: "Lead", note: "  " }, { createdAt: NOW }), /handoff notes/i);
  assert.throws(() => appendRemediationHandoffNote([], { author: "", note: "Next shift to verify error rate." }, { createdAt: NOW }), /author/i);
  const result = appendRemediationHandoffNote(record.handoffNotes, {
    author: "Release lead", handedTo: "Night shift", note: "Keep the API error finding open until the fresh measured run is reviewed.", handoffSummary: queue.handoffSummary,
  }, { createdAt: NOW, id: "handoff-test-1" });
  const saved = updateArchitectureDecisionRecord(record, { handoffNotes: result.notes }, { updatedAt: NOW });
  const note = normalizeRemediationHandoffNotes(saved.handoffNotes)[0];
  assert.equal(note.handedTo, "Night shift");
  assert.equal(note.summarySnapshot.activeTaskCount, queue.totalCount);
  assert.equal(note.summarySnapshot.counts.acknowledgedBlockers, 1);
  assert.equal(note.summarySnapshot.references.acknowledgedBlockers[0].findingCode, "ERR-HANDOFF");
  assert.ok(saved.auditTrail.some((event) => event.type === "escalation-handoff-note-added"));
  assert.equal(saved.reportSnapshot.recommendation, record.reportSnapshot.recommendation, "saving a handoff note must preserve the decision-time report snapshot");
  assert.deepEqual(saved.reviewFindings, record.reviewFindings, "saving a handoff note must not mutate canonical findings or evidence");
});

test("decision Markdown and document-wide handoff export include the summary and point-in-time notes", () => {
  const { record, queue } = prepareRecord();
  const created = appendRemediationHandoffNote([], {
    author: "Release lead", handedTo: "Next shift", note: "Confirm fresh source evidence before proposing release approval.", handoffSummary: queue.handoffSummary,
  }, { createdAt: NOW, id: "handoff-export-1" });
  const saved = updateArchitectureDecisionRecord(record, { handoffNotes: created.notes }, { updatedAt: NOW });
  const decisionMarkdown = formatArchitectureDecisionRecordMarkdown(saved, { now: NOW });
  assert.match(decisionMarkdown, /Escalation review & handoff notes/);
  assert.match(decisionMarkdown, /Confirm fresh source evidence/);
  assert.match(decisionMarkdown, /Queue snapshot at note time/);
  const globalMarkdown = formatRemediationHandoffMarkdown({ queue: buildRemediationWorkQueue([saved], { now: NOW }), decisionRecords: [saved], generatedAt: NOW });
  assert.match(globalMarkdown, /Sketchizi Escalation Review & Handoff/);
  assert.match(globalMarkdown, /Acknowledged rollout blockers/);
  assert.match(globalMarkdown, /Resolved queue tasks whose findings remain open/);
  assert.match(globalMarkdown, /Next shift/);
  assert.match(globalMarkdown, /does not authenticate evidence or approve deployment/);
});

test("release evidence bundle exports handoff state and reviewer detects tampered category counts", () => {
  const { record, queue } = prepareRecord();
  const noteResult = appendRemediationHandoffNote([], {
    author: "Incident lead", note: "Next shift should verify the error budget against current evidence.", handoffSummary: queue.handoffSummary,
  }, { createdAt: NOW, id: "handoff-bundle-1" });
  const saved = updateArchitectureDecisionRecord(record, { handoffNotes: noteResult.notes }, { updatedAt: NOW });
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [], generatedAt: NOW });
  assert.equal(bundle.decisionRecord.handoffNotes.length, 1);
  assert.equal(bundle.remediationWorkQueue.handoffSummary.overdueTasks.count, 2);
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "handoff-bundle.json" });
  const handoffWarnings = review.findings.filter((finding) => finding.code.startsWith("work-queue-handoff-") || finding.code.startsWith("handoff-note-"));
  assert.equal(handoffWarnings.length, 0, JSON.stringify(handoffWarnings));
  const tampered = structuredClone(bundle);
  tampered.remediationWorkQueue.handoffSummary.overdueTasks.count += 1;
  const tamperedReview = reviewReleaseEvidenceBundle(tampered, { sourceName: "tampered-handoff-bundle.json" });
  assert.ok(tamperedReview.findings.some((finding) => finding.code === "work-queue-handoff-summary-total-mismatch" || finding.code === "work-queue-handoff-summary-mismatch-overdueTasks"));
  const tamperedNote = structuredClone(bundle);
  tamperedNote.decisionRecord.handoffNotes[0].independentlyVerified = true;
  const noteReview = reviewReleaseEvidenceBundle(tamperedNote, { sourceName: "tampered-note-bundle.json" });
  assert.ok(noteReview.findings.some((finding) => finding.code === "handoff-note-verification-claim-0"));
});



test("handoff receipt is a manual attestation and preserves the original point-in-time snapshot", () => {
  const { record, queue } = prepareRecord();
  const created = appendRemediationHandoffNote([], { author: "Release lead", note: "Carry the open API blocker forward.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "receipt-immutable-test" });
  const originalSnapshot = structuredClone(created.note.summarySnapshot);
  const result = recordRemediationHandoffReceipt(created.notes, created.note.id, { reviewer: "Night reviewer", status: "received-with-follow-up", note: "Will verify the new error-rate run." }, { recordedAt: "2026-10-20T11:00:00.000Z" });
  const saved = normalizeRemediationHandoffNotes(result.notes)[0];
  assert.deepEqual(saved.summarySnapshot, originalSnapshot);
  assert.equal(saved.receipt.reviewer, "Night reviewer");
  assert.equal(saved.receipt.status, "received-with-follow-up");
  assert.equal(saved.receipt.independentlyVerified, false);
  assert.equal(saved.classification, "manual-handoff-note");
  assert.throws(() => recordRemediationHandoffReceipt(result.notes, "missing-note", { reviewer: "Reviewer", status: "received" }, { recordedAt: NOW }), /existing handoff note/i);
});

test("handoff reconciliation detects changes against snapshot references without mutating history", () => {
  const { queue } = prepareRecord();
  const created = appendRemediationHandoffNote([], { author: "Release lead", note: "Check current assignments.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "reconcile-test" });
  const snapshot = structuredClone(created.note.summarySnapshot);
  const reference = snapshot.references.acknowledgedBlockers[0];
  const liveItems = queue.items.map((item) => item.id === reference.id ? { ...item, assignee: "New on-call" } : item);
  const result = reconcileRemediationHandoff(created.note, { ...queue, items: liveItems, evaluatedDate: "2026-10-21" });
  assert.ok(result.carryForward.some((entry) => entry.taskId === reference.id && /Assignee changed/.test(entry.reason)));
  assert.equal(result.classification, "derived-handoff-follow-up-reconciliation");
  assert.match(result.disclaimer, /bounded previews/i);
  assert.deepEqual(created.note.summarySnapshot, snapshot);
});

test("panel, CSS and simulation test script expose review categories and handoff Markdown export", async () => {
  const { readFile } = await import("node:fs/promises");
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(panel, /aria-label="Escalation review and handoff"/);
  assert.match(panel, /Acknowledged blockers/);
  assert.match(panel, /Resolved tasks · findings still open/);
  assert.match(panel, /Export escalation handoff \(\.md\)/);
  assert.match(panel, /Save handoff note/);
  assert.match(css, /\.sim-remediation-handoff-categories/);
  assert.match(packageJson.scripts["test:simulation"], /tests\/remediation-handoff\.test\.js/);
});


test("carry-forward action ledger requires owner, due date, closure criteria, and evidence to close", () => {
  const { queue } = prepareRecord();
  const created = appendRemediationHandoffNote([], { author: "Release lead", note: "Carry forward changed tasks.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "action-ledger-test" });
  const reference = created.note.summarySnapshot.references.acknowledgedBlockers[0];
  const reconciliation = reconcileRemediationHandoff(created.note, { ...queue, items: queue.items.map((item) => item.id === reference.id ? { ...item, assignee: "New on-call" } : item) });
  assert.throws(() => createRemediationHandoffActions(created.note, reconciliation, { owner: "", dueDate: "2026-10-22", closureCriteria: "Evidence reviewed" }, { actor: "Lead", createdAt: NOW }), /owner/i);
  const result = createRemediationHandoffActions(created.note, reconciliation, { owner: "Ops", dueDate: "2026-10-22", closureCriteria: "Attach a passing verification run" }, { actor: "Lead", createdAt: NOW });
  assert.ok(result.createdCount >= 1);
  const action = result.actions[0];
  assert.equal(action.status, "open");
  assert.equal(action.history[0].event, "created-from-reconciliation");
  assert.throws(() => updateRemediationHandoffAction(result.note, action.id, { status: "closed" }, { actor: "Lead", updatedAt: "2026-10-20T12:00:00.000Z" }), /closure evidence/i);
  const updated = updateRemediationHandoffAction(result.note, action.id, { status: "closed", closureEvidence: "run-2026-10-20-17" }, { actor: "Lead", updatedAt: "2026-10-20T12:00:00.000Z" });
  assert.equal(updated.action.status, "closed");
  assert.equal(updated.action.history.at(-1).event, "closed");
  assert.equal(updated.action.independentlyVerified, false);
  assert.throws(() => updateRemediationHandoffAction(updated.note, action.id, { status: "open" }, { actor: "Lead", updatedAt: "2026-10-20T13:00:00.000Z" }), /immutable/i);
  const markdown = formatRemediationHandoffMarkdown({ queue, decisionRecords: [{ id: "record-1", title: "Record", handoffNotes: [updated.note] }], generatedAt: NOW });
  assert.match(markdown, /Carry-forward action ledger/);
  assert.match(markdown, /Attach a passing verification run/);
});


test("closure review acceptance records reviewer rationale without changing closed action history", () => {
  const { queue } = prepareRecord();
  const saved = appendRemediationHandoffNote([], { author: "Shift lead", note: "Carry this task forward.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "note-review-accept" });
  const created = createRemediationHandoffActions(saved.note, {
    handoffNoteId: saved.note.id,
    carryForward: [{ taskId: "task-review-1", category: "overdueTasks", findingCode: "WARN-OVERDUE", findingTitle: "Review cache timeout", recordId: "adr-handoff-test", reason: "Still overdue" }],
  }, { owner: "Platform", dueDate: "2026-10-25", closureCriteria: "Confirm timeout rate is within target." }, { createdAt: NOW, actor: "Shift lead" });
  const closed = updateRemediationHandoffAction(created.note, created.actions[0].id, { status: "closed", closureEvidence: "run://verification-123" }, { updatedAt: "2026-10-21T10:00:00.000Z", actor: "Platform" });
  const result = reviewRemediationHandoffClosure(closed.note, closed.action.id, {
    reviewer: "Release reviewer", decision: "accepted", rationale: "Evidence reference and criteria were reviewed.",
  }, { reviewedAt: "2026-10-21T11:00:00.000Z", id: "review-accepted-1" });
  assert.equal(result.reviewedAction.status, "closed");
  assert.equal(result.reviewedAction.closureReviews.length, 1);
  assert.equal(result.reviewedAction.closureReviews[0].decision, "accepted");
  assert.equal(result.followUpAction, null);
  assert.equal(result.reviewedAction.history.at(-1).event, "closure-review-accepted");
});

test("rejected closure review preserves the closed action and creates a linked replacement action", () => {
  const { queue } = prepareRecord();
  const saved = appendRemediationHandoffNote([], { author: "Shift lead", note: "Carry this task forward.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "note-review-reject" });
  const created = createRemediationHandoffActions(saved.note, {
    handoffNoteId: saved.note.id,
    carryForward: [{ taskId: "task-review-2", category: "overdueTasks", findingCode: "WARN-OVERDUE", findingTitle: "Review cache timeout", recordId: "adr-handoff-test", reason: "Still overdue" }],
  }, { owner: "Platform", dueDate: "2026-10-25", closureCriteria: "Confirm timeout rate is within target." }, { createdAt: NOW, actor: "Shift lead" });
  const closed = updateRemediationHandoffAction(created.note, created.actions[0].id, { status: "closed", closureEvidence: "run://verification-456" }, { updatedAt: "2026-10-21T10:00:00.000Z", actor: "Platform" });
  const result = reviewRemediationHandoffClosure(closed.note, closed.action.id, {
    reviewer: "Release reviewer", decision: "rejected", rationale: "Evidence does not demonstrate sustained recovery.",
    owner: "On-call", dueDate: "2026-10-26", closureCriteria: "Demonstrate sustained recovery over 30 minutes.",
  }, { reviewedAt: "2026-10-21T11:00:00.000Z", id: "review-rejected-1" });
  assert.equal(result.reviewedAction.status, "closed", "original closed action remains closed");
  assert.equal(result.followUpAction.parentActionId, closed.action.id);
  assert.equal(result.followUpAction.status, "open");
  assert.equal(result.followUpAction.owner, "On-call");
  assert.equal(result.note.followUpActions.length, 2);
  const markdown = formatRemediationHandoffMarkdown({ queue, decisionRecords: [{ id: "adr-handoff-test", title: "Handoff decision", handoffNotes: [result.note] }], generatedAt: NOW });
  assert.match(markdown, /Closure review: REJECTED/);
  assert.match(markdown, /Reopened from closed action/);
});

test("closure review rejects missing rationale and reviews of open actions", () => {
  const { queue } = prepareRecord();
  const saved = appendRemediationHandoffNote([], { author: "Shift lead", note: "Follow-up required.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "note-review-validation" });
  const created = createRemediationHandoffActions(saved.note, {
    handoffNoteId: saved.note.id,
    carryForward: [{ taskId: "task-review-3", category: "overdueTasks", reason: "Changed" }],
  }, { owner: "Platform", dueDate: "2026-10-25", closureCriteria: "Confirm fixed." }, { createdAt: NOW, actor: "Shift lead" });
  assert.throws(() => reviewRemediationHandoffClosure(created.note, created.actions[0].id, {
    reviewer: "Reviewer", decision: "accepted", rationale: "",
  }, { reviewedAt: NOW }), /rationale/);
  assert.throws(() => reviewRemediationHandoffClosure(created.note, created.actions[0].id, {
    reviewer: "Reviewer", decision: "accepted", rationale: "Reviewed.",
  }, { reviewedAt: NOW }), /Only closed actions/);
});


test("accountability dashboard groups actions by owner and recommends overdue escalation without auto-escalating", () => {
  const { record, queue } = prepareRecord();
  const noteResult = appendRemediationHandoffNote([], {
    author: "Release lead", handedTo: "Next shift", note: "Track carry-forward work.", handoffSummary: queue.handoffSummary,
  }, { createdAt: "2026-10-10T10:00:00.000Z", id: "accountability-dashboard-note" });
  const reconciliation = {
    handoffNoteId: noteResult.note.id,
    carryForward: [
      { taskId: "task-overdue", category: "overdueTasks", findingCode: "WARN-OVERDUE", findingTitle: "Overdue cache review", recordId: record.id, reason: "Due date missed." },
      { taskId: "task-aging", category: "unresolvedFollowUps", findingCode: "INFO-OPEN", findingTitle: "Ownership follow-up", recordId: record.id, reason: "Still open." },
    ],
  };
  const actions = createRemediationHandoffActions(noteResult.note, reconciliation, {
    owner: "Platform", dueDate: "2026-10-15", closureCriteria: "Attach a passing verification run.",
  }, { createdAt: "2026-10-15T10:00:00.000Z", actor: "Release lead" });
  const dashboard = buildRemediationHandoffAccountabilityDashboard([actions.note], {
    asOfDate: "2026-10-20", agingThresholdDays: 3,
  });
  assert.equal(dashboard.totalActionCount, 2);
  assert.equal(dashboard.openCount, 2);
  assert.equal(dashboard.overdueCount, 2);
  assert.equal(dashboard.recommendedEscalationCount, 2);
  assert.equal(dashboard.ownerGroups[0].owner, "Platform");
  assert.equal(dashboard.ownerGroups[0].overdue, 2);
  assert.ok(dashboard.actions.every((action) => action.escalation.requiresHumanDecision));
  const filtered = buildRemediationHandoffAccountabilityDashboard([actions.note], { asOfDate: "2026-10-20", filter: "overdue" });
  assert.equal(filtered.totalActionCount, 2);
  const markdown = formatRemediationHandoffAccountabilityMarkdown(dashboard, { generatedAt: NOW });
  assert.match(markdown, /Handoff Accountability/);
  assert.match(markdown, /Escalation recommendation/);
  assert.match(markdown, /does not close its underlying remediation task/);
});

test("accountability dashboard validates dates, threshold and filters", () => {
  assert.throws(() => buildRemediationHandoffAccountabilityDashboard([], { asOfDate: "not-a-date" }), /evaluation date/i);
  assert.throws(() => buildRemediationHandoffAccountabilityDashboard([], { agingThresholdDays: 0 }), /threshold/i);
  assert.throws(() => buildRemediationHandoffAccountabilityDashboard([], { filter: "everything" }), /filter/i);
});


test("escalation policy evaluates configurable blocker rules and records duplicate-safe human decisions", () => {
  const { record, queue } = prepareRecord();
  const noteResult = appendRemediationHandoffNote([], {
    author: "Release lead", handedTo: "Incident commander", note: "Review blocker escalation.", handoffSummary: queue.handoffSummary,
  }, { createdAt: "2026-10-10T10:00:00.000Z", id: "escalation-policy-note" });
  const reconciliation = { handoffNoteId: noteResult.note.id, carryForward: [
    { taskId: "critical-task", category: "acknowledgedBlockers", findingCode: "ERR-API", findingTitle: "API error blocker", recordId: record.id, severity: "error", blocksRollout: true, reason: "Error finding remains open." },
    { taskId: "info-task", category: "unresolvedFollowUps", findingCode: "INFO-OPS", findingTitle: "Operations note", recordId: record.id, severity: "info", blocksRollout: false, reason: "Informational follow-up." },
  ] };
  const created = createRemediationHandoffActions(noteResult.note, reconciliation, { owner: "On-call", dueDate: "2026-10-12", closureCriteria: "Provide passing measured run." }, { createdAt: "2026-10-12T10:00:00.000Z", actor: "Release lead" });
  const evaluation = evaluateRemediationHandoffEscalationPolicy([created.note], { asOfDate: "2026-10-20", overdueDays: 2, agingDays: 5, severities: ["error", "warning"], rolloutBlockersOnly: true, policyId: "prod-rollout" });
  assert.equal(evaluation.candidateCount, 1);
  assert.equal(evaluation.candidates[0].taskId, "critical-task");
  assert.equal(evaluation.candidates[0].requiresHumanDecision, true);
  assert.throws(() => recordRemediationHandoffEscalationDecision([created.note], created.note.id, created.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Wait" }, { decidedAt: NOW }), /next-review date/i);
  const recorded = recordRemediationHandoffEscalationDecision([created.note], created.note.id, created.actions[0].id, { reviewer: "Incident commander", decision: "defer", rationale: "Wait for the controlled rerun.", nextReviewDate: "2026-10-21", policyId: "prod-rollout" }, { decidedAt: NOW, id: "decision-critical-1" });
  assert.equal(recorded.note.escalationDecisions.length, 1);
  assert.equal(recorded.decision.nextReviewDate, "2026-10-21");
  const reevaluated = evaluateRemediationHandoffEscalationPolicy(recorded.notes, { asOfDate: "2026-10-20", overdueDays: 2, agingDays: 5, severities: ["error", "warning"], rolloutBlockersOnly: true, policyId: "prod-rollout" });
  assert.equal(reevaluated.duplicateDecisionCount, 1);
  assert.equal(reevaluated.candidates[0].duplicateDecision.decision, "defer");
  assert.throws(() => recordRemediationHandoffEscalationDecision(recorded.notes, created.note.id, created.actions[0].id, { reviewer: "Incident commander", decision: "defer", rationale: "Wait for the controlled rerun.", nextReviewDate: "2026-10-21", policyId: "prod-rollout" }, { decidedAt: NOW, id: "decision-critical-2" }), /matching escalation decision already exists/i);
  const exported = formatRemediationHandoffMarkdown({ queue, decisionRecords: [{ id: record.id, title: "Handoff decision", handoffNotes: recorded.notes }], generatedAt: NOW });
  assert.match(exported, /Escalation policy decisions/);
  assert.match(exported, /next review: 2026-10-21/);
});


test("escalation review queue classifies overdue, due, upcoming and policy-changed deferred decisions", () => {
  const { record, queue } = prepareRecord();
  const base = appendRemediationHandoffNote([], { author: "Release lead", handedTo: "Incident commander", note: "Review scheduling fixture.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "review-schedule-note" });
  const actions = createRemediationHandoffActions(base.note, { handoffNoteId: base.note.id, carryForward: [{ taskId: "review-task", category: "acknowledgedBlockers", reason: "Still blocked.", severity: "error", blocksRollout: true }] }, { owner: "On-call", dueDate: "2026-10-19", closureCriteria: "Verify controlled rerun." }, { createdAt: NOW, actor: "Release lead" });
  const first = recordRemediationHandoffEscalationDecision([actions.note], actions.note.id, actions.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Wait for rerun.", nextReviewDate: "2026-10-19", policyId: "policy-v1" }, { decidedAt: "2026-10-15T10:00:00.000Z", id: "review-due-old" });
  const second = recordRemediationHandoffEscalationDecision(first.notes, actions.note.id, actions.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Await next window.", nextReviewDate: "2026-10-20", policyId: "policy-v1" }, { decidedAt: NOW, id: "review-due-today" });
  const third = recordRemediationHandoffEscalationDecision(second.notes, actions.note.id, actions.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Await scheduled run.", nextReviewDate: "2026-10-22", policyId: "policy-v1" }, { decidedAt: NOW, id: "review-upcoming" });
  const result = buildRemediationHandoffEscalationReviewQueue(third.notes, { asOfDate: "2026-10-20", windowDays: 2, currentPolicyId: "policy-v2" });
  assert.equal(result.overdueCount, 1);
  assert.equal(result.dueCount, 1);
  assert.equal(result.upcomingCount, 1);
  assert.equal(result.policyChangedCount, 3);
  assert.ok(result.items.every((item) => item.policyChanged && item.requiresHumanDecision));
  assert.throws(() => buildRemediationHandoffEscalationReviewQueue(third.notes, { asOfDate: "bad-date" }), /valid escalation review queue date/i);
});

test("escalation review records immutable history and links replacement decisions to their source", () => {
  const { queue } = prepareRecord();
  const base = appendRemediationHandoffNote([], { author: "Release lead", handedTo: "Incident commander", note: "Review decision fixture.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "review-history-note" });
  const actions = createRemediationHandoffActions(base.note, { handoffNoteId: base.note.id, carryForward: [{ taskId: "review-history-task", category: "acknowledgedBlockers", reason: "Still blocked." }] }, { owner: "On-call", dueDate: "2026-10-21", closureCriteria: "Attach verification." }, { createdAt: NOW, actor: "Release lead" });
  const recorded = recordRemediationHandoffEscalationDecision([actions.note], actions.note.id, actions.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Wait for evidence.", nextReviewDate: "2026-10-21", policyId: "policy-v1" }, { decidedAt: NOW, id: "review-source-decision" });
  const reviewed = recordRemediationHandoffEscalationReview(recorded.notes, actions.note.id, "review-source-decision", { reviewer: "Incident commander", outcome: "escalate", rationale: "Policy now requires immediate escalation.", currentPolicyId: "policy-v2" }, { reviewedAt: "2026-10-20T12:00:00.000Z", id: "review-event-1" });
  assert.equal(reviewed.sourceDecision.reviewHistory.length, 1);
  assert.equal(reviewed.sourceDecision.reviewHistory[0].policyChanged, true);
  assert.equal(reviewed.replacementDecision.decision, "escalate");
  assert.equal(reviewed.replacementDecision.supersedesDecisionId, "review-source-decision");
  assert.throws(() => recordRemediationHandoffEscalationReview(reviewed.notes, actions.note.id, "review-source-decision", { reviewer: "Lead", outcome: "reaffirm", rationale: "Again", currentPolicyId: "policy-v2" }, { reviewedAt: "2026-10-20T13:00:00.000Z", id: "review-event-2" }), /already been superseded/i);
  const exported = formatRemediationHandoffMarkdown({ queue, decisionRecords: [{ id: "review-record", title: "Review record", handoffNotes: reviewed.notes }], generatedAt: NOW });
  assert.match(exported, /Review \*\*ESCALATE\*\*/);
  assert.match(exported, /supersedes review-source-decision/);
});


test("escalation SLA metrics distinguish overdue reviews and calculate review latency from retained history", () => {
  const { record, queue } = prepareRecord();
  const base = appendRemediationHandoffNote([], { author: "Release lead", handedTo: "Incident commander", note: "SLA metrics fixture.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "sla-metrics-note" });
  const actions = createRemediationHandoffActions(base.note, { handoffNoteId: base.note.id, carryForward: [{ taskId: "sla-task", category: "acknowledgedBlockers", reason: "Still blocked.", severity: "error", blocksRollout: true }] }, { owner: "On-call", dueDate: "2026-10-19", closureCriteria: "Verify controlled rerun." }, { createdAt: NOW, actor: "Release lead" });
  const deferred = recordRemediationHandoffEscalationDecision([actions.note], actions.note.id, actions.actions[0].id, { reviewer: "Lead", decision: "defer", rationale: "Wait for rerun.", nextReviewDate: "2026-10-19", policyId: "policy-v1" }, { decidedAt: "2026-10-15T10:00:00.000Z", id: "sla-decision" });
  const reviewed = recordRemediationHandoffEscalationReview(deferred.notes, actions.note.id, "sla-decision", { reviewer: "Lead", outcome: "reaffirm", rationale: "Keep the review open.", currentPolicyId: "policy-v1" }, { reviewedAt: "2026-10-18T10:00:00.000Z", id: "sla-review" });
  const metrics = buildRemediationHandoffEscalationSlaMetrics(reviewed.notes, { asOfDate: "2026-10-20", reviewSlaDays: 3 });
  assert.equal(metrics.counts.reviewsRecorded, 1);
  assert.equal(metrics.counts.overdueReviews, 1);
  assert.equal(metrics.reviewLatency.averageDays, 3);
  assert.equal(metrics.reviewLatency.withinSlaRate, 1);
  assert.equal(metrics.overdueRate, 1);
  assert.equal(metrics.outcomeCounts.reaffirm, 1);
  assert.match(metrics.disclaimer, /not independent operational telemetry/i);
});

test("policy simulation reports candidate deltas without mutating handoff decisions", () => {
  const { record, queue } = prepareRecord();
  const base = appendRemediationHandoffNote([], { author: "Release lead", handedTo: "Incident commander", note: "Policy simulation fixture.", handoffSummary: queue.handoffSummary }, { createdAt: NOW, id: "policy-sim-note" });
  const actions = createRemediationHandoffActions(base.note, { handoffNoteId: base.note.id, carryForward: [
    { taskId: "sim-error", category: "acknowledgedBlockers", reason: "Error blocker.", severity: "error", blocksRollout: true },
    { taskId: "sim-warning", category: "unresolvedFollowUps", reason: "Warning follow-up.", severity: "warning", blocksRollout: false },
  ] }, { owner: "On-call", dueDate: "2026-10-19", closureCriteria: "Verify controlled rerun." }, { createdAt: NOW, actor: "Release lead" });
  const before = structuredClone([actions.note]);
  const result = simulateRemediationHandoffEscalationPolicy([actions.note], {
    baselinePolicy: { asOfDate: "2026-10-20", overdueDays: 1, agingDays: 7, severities: ["error", "warning"], policyId: "baseline" },
    proposedPolicy: { asOfDate: "2026-10-20", overdueDays: 1, agingDays: 365, severities: ["error", "warning"], rolloutBlockersOnly: true, policyId: "proposed" },
  });
  assert.equal(result.baseline.candidateCount, 2);
  assert.equal(result.proposed.candidateCount, 1);
  assert.equal(result.delta.candidateCount, -1);
  assert.equal(result.delta.newlyEligible.length, 0);
  assert.equal(result.delta.noLongerEligible.length, 1);
  assert.deepEqual([actions.note], before, "policy simulation must not mutate its input records");
  assert.match(result.disclaimer, /does not apply the proposed policy/i);
});
