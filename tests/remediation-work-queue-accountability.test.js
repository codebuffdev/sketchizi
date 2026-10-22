import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecord, formatArchitectureDecisionRecordMarkdown } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildRemediationWorkQueue, filterRemediationWorkQueue } from "../src/features/simulation/experiments/remediationWorkQueue.js";
import { updateRemediationWorkQueueTask } from "../src/features/simulation/experiments/remediationWorkQueueMetadata.js";
import { mergeReleaseBundleReviewFindings } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";

const NOW = "2026-10-20T10:00:00.000Z";
const TODAY = "2026-10-20";
const report = {
  title: "Work queue accountability fixture", baselineName: "Baseline", proposedName: "Proposed",
  decision: "Insufficient evidence", rationale: "Fixture only", confidence: "Low",
  changeStatus: "changed", changeCount: 1, changes: [{ action: "Modified", subjectType: "Component", label: "API" }],
  simulationStatus: "unavailable", simulationReason: "No comparable simulation", metrics: [],
  risks: [], limitations: [], nextSteps: [], profileConfirmed: false, loadTestRecordsCount: 0,
};

function makeRecord(id, findings) {
  const created = createArchitectureDecisionRecord({ report, id, createdAt: "2026-10-18T10:00:00.000Z", title: `Decision ${id}` });
  const merged = mergeReleaseBundleReviewFindings([], {
    sourceName: `${id}-release.json`,
    bundleMetadata: { recordId: `${id}-bundle`, generatedAt: "2026-10-18T09:00:00.000Z" },
    findings,
  });
  return updateArchitectureDecisionRecord(created, { reviewFindings: merged.findings }, { updatedAt: "2026-10-18T10:01:00.000Z" });
}

function makeFixtureRecords() {
  let first = makeRecord("adr-accountability-a", [
    { code: "ERR-1", severity: "error", title: "API error budget exhausted", detail: "Error rate remains too high." },
    { code: "WARN-1", severity: "warning", title: "Review API latency", detail: "Latency needs another review." },
    { code: "WARN-2", severity: "warning", title: "Review database pool", detail: "Pool assumptions need review." },
  ]);
  let second = makeRecord("adr-accountability-b", [
    { code: "ERR-2", severity: "error", title: "Database errors recur", detail: "Database error rate is elevated." },
    { code: "WARN-3", severity: "warning", title: "Review cache policy", detail: "Cache behavior needs review." },
  ]);

  const queueA = buildRemediationWorkQueue([first], { now: NOW });
  const byCodeA = new Map(queueA.items.map((item) => [item.findingCode, item]));
  let taskUpdates = first.workQueueTasks;
  taskUpdates = updateRemediationWorkQueueTask(taskUpdates, byCodeA.get("ERR-1").id, { assignee: "SRE", dueDate: "2026-10-15" }, { updatedAt: "2026-10-18T12:00:00.000Z" }).tasks;
  taskUpdates = updateRemediationWorkQueueTask(taskUpdates, byCodeA.get("WARN-1").id, { assignee: "Platform", dueDate: TODAY }, { updatedAt: "2026-10-18T12:01:00.000Z" }).tasks;
  taskUpdates = updateRemediationWorkQueueTask(taskUpdates, byCodeA.get("WARN-2").id, { assignee: "Frontend", dueDate: "2026-10-27" }, { updatedAt: "2026-10-18T12:02:00.000Z" }).tasks;
  first = updateArchitectureDecisionRecord(first, { workQueueTasks: taskUpdates }, { updatedAt: "2026-10-18T12:03:00.000Z" });

  const queueB = buildRemediationWorkQueue([second], { now: NOW });
  const byCodeB = new Map(queueB.items.map((item) => [item.findingCode, item]));
  let secondTasks = second.workQueueTasks;
  secondTasks = updateRemediationWorkQueueTask(secondTasks, byCodeB.get("ERR-2").id, { dueDate: "2026-10-18" }, { updatedAt: "2026-10-18T12:00:00.000Z" }).tasks;
  secondTasks = updateRemediationWorkQueueTask(secondTasks, byCodeB.get("WARN-3").id, { assignee: "API team", dueDate: "2026-10-28" }, { updatedAt: "2026-10-18T12:01:00.000Z" }).tasks;
  second = updateArchitectureDecisionRecord(second, { workQueueTasks: secondTasks }, { updatedAt: "2026-10-18T12:02:00.000Z" });
  return [first, second];
}

test("work queue summarizes per-assignee workload, seven-day deadlines, and overdue blocker escalation", () => {
  const records = makeFixtureRecords();
  const queue = buildRemediationWorkQueue(records, { now: NOW });

  assert.equal(queue.upcomingDeadlineWindowDays, 7);
  assert.equal(queue.upcomingDeadlineThrough, "2026-10-27");
  assert.equal(queue.upcomingDeadlineCount, 2, "due today and the seventh day are included; day eight is excluded");
  assert.equal(queue.upcomingDeadlines.length, 2);
  assert.deepEqual(new Set(queue.upcomingDeadlines.map((item) => item.dueDate)), new Set([TODAY, "2026-10-27"]));
  assert.deepEqual(new Set(filterRemediationWorkQueue(queue.items, "upcoming").map((item) => item.dueDate)), new Set([TODAY, "2026-10-27"]));
  assert.deepEqual(new Set(filterRemediationWorkQueue(queue.items, "upcoming", { upcomingDeadlines: queue.upcomingDeadlines }).map((item) => item.dueDate)), new Set([TODAY, "2026-10-27"]));
  assert.equal(filterRemediationWorkQueue(queue.items, "overdue-blockers").length, 2);

  assert.equal(queue.escalationSummary.overdueBlockerCount, 2);
  assert.equal(queue.escalationSummary.unassignedOverdueBlockerCount, 1);
  assert.equal(queue.escalationSummary.affectedDecisionRecordCount, 2);
  assert.equal(queue.escalationSummary.oldestDueDate, "2026-10-15");
  assert.equal(queue.escalationSummary.oldestDaysOverdue, 5);
  assert.equal(queue.escalationSummary.items.length, 2);

  const workloads = new Map(queue.assigneeWorkloads.map((item) => [item.assignee, item]));
  assert.equal(queue.totalAssigneeCount, 5);
  assert.equal(workloads.get("SRE").overdueBlockerCount, 1);
  assert.equal(workloads.get("Unassigned").blockingCount, 1);
  assert.equal(workloads.get("Platform").upcomingDeadlineCount, 1);
  assert.equal(workloads.get("Frontend").upcomingDeadlineCount, 1);
  assert.equal(workloads.get("API team").upcomingDeadlineCount, 0);
});

test("assignee summaries cover all derived tasks beyond the display cap and upcoming view uses its bounded preview", () => {
  const warningFindings = (prefix, count) => Array.from({ length: count }, (_, index) => ({
    code: `${prefix}-WARN-${String(index + 1).padStart(3, "0")}`,
    severity: "warning", title: `${prefix} warning ${index + 1}`, detail: "Follow-up review required.",
  }));
  const firstRecords = [
    makeRecord("adr-bulk-a", warningFindings("A", 100)),
    makeRecord("adr-bulk-b", warningFindings("B", 100)),
    makeRecord("adr-bulk-c", warningFindings("C", 100)),
  ];
  let lastRecord = makeRecord("adr-bulk-d", [
    { code: "INFO-UPCOMING", severity: "info", title: "Check documentation ownership", detail: "Confirm ownership before the deadline." },
    ...warningFindings("D", 99),
  ]);
  const lastRecordQueue = buildRemediationWorkQueue([lastRecord], { now: NOW });
  const upcomingItem = lastRecordQueue.items.find((item) => item.findingCode === "INFO-UPCOMING");
  assert.ok(upcomingItem);
  const updatedTask = updateRemediationWorkQueueTask(lastRecord.workQueueTasks, upcomingItem.id, {
    assignee: "Documentation", dueDate: "2026-10-23",
  }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  lastRecord = updateArchitectureDecisionRecord(lastRecord, { workQueueTasks: updatedTask.tasks }, { updatedAt: "2026-10-19T12:01:00.000Z" });

  const queue = buildRemediationWorkQueue([...firstRecords, lastRecord], { now: NOW });
  assert.equal(queue.totalCount, 400);
  assert.equal(queue.items.length, 300);
  assert.equal(queue.truncated, true);
  assert.equal(queue.totalAssigneeCount, 2);
  const workloadByAssignee = new Map(queue.assigneeWorkloads.map((item) => [item.assignee, item]));
  assert.equal(workloadByAssignee.get("Unassigned").taskCount, 399);
  assert.equal(workloadByAssignee.get("Documentation").taskCount, 1);
  assert.equal(queue.assigneeWorkloads.reduce((sum, item) => sum + item.taskCount, 0), 400, "summary totals include queue tasks beyond the visible list");
  assert.equal(queue.upcomingDeadlineCount, 1);
  assert.ok(!queue.items.some((item) => item.id === upcomingItem.id), "normal-priority upcoming task is outside the 300-item ranked display cap");
  const upcomingView = filterRemediationWorkQueue(queue.items, "upcoming", { upcomingDeadlines: queue.upcomingDeadlines });
  assert.equal(upcomingView.length, 1);
  assert.equal(upcomingView[0].id, upcomingItem.id, "the bounded upcoming preview remains navigable when the task is outside the general queue cap");
});

test("release evidence exports accountability summaries and reviewer recalculates them", () => {
  const [record] = makeFixtureRecords();
  const bundle = buildReleaseEvidenceBundle({ record, loadTestRecords: [], generatedAt: NOW });
  const queue = bundle.remediationWorkQueue;
  assert.equal(queue.assigneeSummary.scope, "all-derived-tasks-for-exported-record");
  assert.equal(queue.upcomingDeadlineSummary.throughDate, "2026-10-27");
  assert.equal(queue.upcomingDeadlineSummary.totalCount, 2);
  assert.equal(queue.overdueBlockerEscalation.overdueBlockerCount, 1);
  assert.equal(queue.overdueBlockerEscalation.oldestDueDate, "2026-10-15");
  const cleanReview = reviewReleaseEvidenceBundle(bundle, { sourceName: "accountability-release.json" });
  assert.equal(cleanReview.findings.some((finding) => finding.code.startsWith("work-queue-")), false, JSON.stringify(cleanReview.findings.filter((finding) => finding.code.startsWith("work-queue-"))));

  const tamperedWorkload = structuredClone(bundle);
  tamperedWorkload.remediationWorkQueue.assigneeSummary.groups[0].taskCount += 7;
  const workloadReview = reviewReleaseEvidenceBundle(tamperedWorkload);
  assert.ok(workloadReview.findings.some((finding) => finding.code === "work-queue-assignee-summary-mismatch"));

  const tamperedEscalation = structuredClone(bundle);
  tamperedEscalation.remediationWorkQueue.overdueBlockerEscalation.oldestDaysOverdue = 0;
  const escalationReview = reviewReleaseEvidenceBundle(tamperedEscalation);
  assert.ok(escalationReview.findings.some((finding) => finding.code === "work-queue-escalation-summary-mismatch"));
});

test("decision Markdown exports an evaluated per-record workload and escalation snapshot", () => {
  const [record] = makeFixtureRecords();
  const markdown = formatArchitectureDecisionRecordMarkdown(record, { now: NOW, loadTestRecords: [] });
  assert.match(markdown, /Work queue accountability snapshot/);
  assert.match(markdown, /Workload by assignee/);
  assert.match(markdown, /Upcoming deadlines/);
  assert.match(markdown, /Overdue blocker escalation/);
  assert.match(markdown, /2026-10-15/);
  assert.match(markdown, /SRE/);
});

test("work queue UI exposes workload, upcoming deadlines, overdue blocker escalation, and direct navigation", async () => {
  const source = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
  assert.match(source, /aria-label="Workload by assignee"/);
  assert.match(source, /aria-label="Upcoming deadlines"/);
  assert.match(source, /aria-label="Overdue blocker escalation"/);
  assert.match(source, /setRemediationWorkQueueFilter\("upcoming"\)/);
  assert.match(source, /setRemediationWorkQueueFilter\("overdue-blockers"\)/);
  assert.match(styles, /\.sim-remediation-work-queue-accountability-grid/);
  assert.match(styles, /\.sim-remediation-work-queue-escalation\.is-active/);
});
