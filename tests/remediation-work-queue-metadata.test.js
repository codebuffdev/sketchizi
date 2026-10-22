import test from "node:test";
import assert from "node:assert/strict";
import { createArchitectureDecisionRecord, formatArchitectureDecisionRecordMarkdown, updateArchitectureDecisionRecord } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";
import { buildRemediationWorkQueue, filterRemediationWorkQueue } from "../src/features/simulation/experiments/remediationWorkQueue.js";
import { normalizeRemediationWorkQueueTasks, updateRemediationWorkQueueTask } from "../src/features/simulation/experiments/remediationWorkQueueMetadata.js";
import { mergeReleaseBundleReviewFindings } from "../src/features/simulation/experiments/reviewFindingTracking.js";

const report = {
  title: "Work queue metadata fixture", baselineName: "Baseline", proposedName: "Proposed",
  decision: "Insufficient evidence", rationale: "Fixture only", confidence: "Low",
  changeStatus: "changed", changeCount: 1, changes: [{ action: "Modified", subjectType: "Component", label: "API" }],
  simulationStatus: "unavailable", simulationReason: "No comparable simulation", metrics: [],
  risks: [], limitations: [], nextSteps: [], profileConfirmed: false, loadTestRecordsCount: 0,
};
function recordWithOpenFinding(id = "adr-work-queue") {
  const created = createArchitectureDecisionRecord({ report, id, createdAt: "2026-10-18T10:00:00.000Z" });
  const merged = mergeReleaseBundleReviewFindings([], {
    sourceName: "release.json",
    bundleMetadata: { recordId: "bundle-1", generatedAt: "2026-10-17T10:00:00.000Z" },
    findings: [{ code: "TASK-1", severity: "warning", title: "Update retry policy", detail: "Retry budget needs review." }],
  });
  return updateArchitectureDecisionRecord(created, { reviewFindings: merged.findings }, { updatedAt: "2026-10-18T10:01:00.000Z" });
}

function firstQueueItem(record, now = "2026-10-20T10:00:00.000Z") {
  return buildRemediationWorkQueue([record], { now }).items[0];
}

test("task metadata has separate ownership, validates due dates, and records field-level audit history", () => {
  const record = recordWithOpenFinding();
  const item = firstQueueItem(record);
  const created = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, {
    assignee: "Platform team", dueDate: "2026-10-19",
  }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  assert.equal(created.changed, true);
  assert.equal(created.task.assignee, "Platform team");
  assert.equal(created.task.dueDate, "2026-10-19");
  assert.equal(created.task.auditTrail.length, 1);
  assert.deepEqual(created.task.auditTrail[0].changes.map((change) => change.field), ["assignee", "dueDate"]);
  const edited = updateRemediationWorkQueueTask(created.tasks, item.id, { assignee: "SRE team", dueDate: "2026-10-21" }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  assert.equal(edited.task.auditTrail.length, 2);
  assert.match(edited.task.auditTrail[1].message, /Assignee changed from Platform team to SRE team/);
  assert.throws(() => updateRemediationWorkQueueTask(edited.tasks, item.id, { dueDate: "2026-02-30" }), /valid calendar date/i);
  assert.throws(() => updateRemediationWorkQueueTask(edited.tasks, item.id, { dueDate: "2026-10-20T00:00:00.000Z" }), /YYYY-MM-DD/i);
  assert.equal(record.reviewFindings[0].owner, "", "task-level assignment must not mutate finding ownership");
  assert.equal(record.reviewFindings[0].status, "open", "task planning must not alter finding disposition");
});

test("queue adds assignee and due-state metadata, highlights overdue tasks, and supports overdue filtering", () => {
  const record = recordWithOpenFinding();
  const item = firstQueueItem(record);
  const update = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, { assignee: "SRE", dueDate: "2026-10-19" }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  const saved = updateArchitectureDecisionRecord(record, { workQueueTasks: update.tasks }, { updatedAt: "2026-10-18T12:01:00.000Z" });
  const queue = buildRemediationWorkQueue([saved], { now: "2026-10-20T10:00:00.000Z" });
  const current = queue.items.find((entry) => entry.id === item.id);
  assert.equal(current.assignee, "SRE");
  assert.equal(current.dueDate, "2026-10-19");
  assert.equal(current.dueState, "overdue");
  assert.equal(current.isOverdue, true);
  assert.equal(queue.overdueCount, 1);
  assert.equal(filterRemediationWorkQueue(queue.items, "overdue").length, 1);
  const dueToday = buildRemediationWorkQueue([saved], { now: "2026-10-19T10:00:00.000Z" }).items.find((entry) => entry.id === item.id);
  assert.equal(dueToday.dueState, "due-today");
  assert.equal(dueToday.isOverdue, false);
});

test("decision record persistence, task-level history, Markdown, and release JSON export carry assignment separately", () => {
  const record = recordWithOpenFinding();
  const item = firstQueueItem(record);
  const update = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, { assignee: "Release engineering", dueDate: "2026-10-19" }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  const saved = updateArchitectureDecisionRecord(record, { workQueueTasks: update.tasks }, { updatedAt: "2026-10-18T12:01:00.000Z" });
  assert.equal(saved.workQueueTasks[0].assignee, "Release engineering");
  assert.ok(saved.auditTrail.some((event) => event.type === "work-queue-task-metadata-updated"));
  const markdown = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(markdown, /Remediation work queue ownership and due dates/);
  assert.match(markdown, /Task assignee:\*\* Release engineering/);
  assert.match(markdown, /2026-10-19/);
  assert.match(markdown, /Task audit history/);
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [], generatedAt: "2026-10-20T10:00:00.000Z" });
  assert.equal(bundle.decisionRecord.workQueueTasks[0].assignee, "Release engineering");
  const activeTask = bundle.remediationWorkQueue.tasks.find((task) => task.id === item.id);
  assert.equal(activeTask.taskAssignee, "Release engineering");
  assert.equal(activeTask.isOverdue, true);
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /overdue/i.test(risk)));
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "assigned-release.json" });
  assert.equal(review.findings.some((finding) => finding.code.startsWith("work-queue-")), false, JSON.stringify(review.findings.filter((finding) => finding.code.startsWith("work-queue-"))));
});

test("task metadata is bounded and saved queue work can become historical without changing finding disposition", () => {
  const record = recordWithOpenFinding();
  const item = firstQueueItem(record);
  const result = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, { assignee: "Team", dueDate: "2026-10-24" }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  const saved = updateArchitectureDecisionRecord(record, { workQueueTasks: result.tasks }, { updatedAt: "2026-10-18T12:01:00.000Z" });
  const metadataHistory = saved.workQueueTasks[0].auditTrail;
  assert.equal(metadataHistory.length, 1);
  assert.equal(saved.reviewFindings[0].status, "open");
  assert.equal(saved.reviewFindings[0].owner, "");
  assert.equal(buildRemediationWorkQueue([saved], { now: "2026-10-20T10:00:00.000Z" }).items.find((entry) => entry.id === item.id).assignee, "Team");
});

test("panel exposes separate task assignee, due date, overdue filter, and task-level history", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
  const queueSource = await readFile(new URL("../src/features/simulation/experiments/remediationWorkQueue.js", import.meta.url), "utf8");
  assert.match(source, /aria-label={`Task assignee for \$\{item\.findingTitle\}`}/);
  assert.match(source, /aria-label={`Task due date for \$\{item\.findingTitle\}`}/);
  assert.match(source, /saveRemediationWorkQueueTaskMetadata\(item\)/);
  assert.match(source, /Task audit history/);
  assert.match(source, /remediationWorkQueue\.overdueCount/);
  assert.match(queueSource, /value: "overdue"/);
  assert.match(styles, /\.sim-remediation-work-queue-schedule/);
  assert.match(styles, /\.sim-remediation-work-queue-due-state\.is-overdue/);
});


test("normalization bounds archived task entries and each task audit trail", () => {
  const tasks = Array.from({ length: 305 }, (_, taskIndex) => ({
    taskId: `task-${taskIndex}`,
    assignee: `team-${taskIndex}`,
    dueDate: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    auditTrail: Array.from({ length: 40 }, (_, eventIndex) => ({
      id: `event-${eventIndex}`,
      type: "task-metadata-updated",
      message: `Change ${eventIndex}`,
      at: `2026-10-${String((eventIndex % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      changes: [{ field: "assignee", from: `team-${eventIndex}`, to: `team-${eventIndex + 1}` }],
    })),
  }));
  const normalized = normalizeRemediationWorkQueueTasks(tasks);
  assert.equal(normalized.length, 300);
  assert.equal(normalized[normalized.length - 1].auditTrail.length, 30);
});

test("release bundle review flags tampered due-state summaries and task assignment mismatches", () => {
  const record = recordWithOpenFinding();
  const item = firstQueueItem(record);
  const update = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, { assignee: "Release engineering", dueDate: "2026-10-19" }, { updatedAt: "2026-10-18T12:00:00.000Z" });
  const saved = updateArchitectureDecisionRecord(record, { workQueueTasks: update.tasks }, { updatedAt: "2026-10-18T12:01:00.000Z" });
  const sourceBundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [], generatedAt: "2026-10-20T10:00:00.000Z" });
  const tamperedDueState = structuredClone(sourceBundle);
  tamperedDueState.remediationWorkQueue.tasks[0].dueState = "scheduled";
  const dueReview = reviewReleaseEvidenceBundle(tamperedDueState);
  assert.ok(dueReview.findings.some((finding) => finding.code === "work-queue-due-state-0"));
  const tamperedAssignee = structuredClone(sourceBundle);
  tamperedAssignee.decisionRecord.workQueueTasks[0].assignee = "Different team";
  const assignmentReview = reviewReleaseEvidenceBundle(tamperedAssignee);
  assert.ok(assignmentReview.findings.some((finding) => finding.code === "work-queue-task-metadata-mismatch-0"));
});
