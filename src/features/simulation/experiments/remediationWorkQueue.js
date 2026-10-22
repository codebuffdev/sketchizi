import { buildRemediationEffectivenessSummary, normalizeDecisionReviewFindings } from "./reviewFindingTracking.js";
import { getRemediationTaskMetadata } from "./remediationWorkQueueMetadata.js";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 240) => String(value ?? "").trim().slice(0, max);
const MAX_QUEUE_ITEMS = 300;
const UPCOMING_DEADLINE_WINDOW_DAYS = 7;
const MAX_ASSIGNEE_SUMMARIES = 100;
const MAX_ESCALATION_PREVIEW_ITEMS = 5;
const MAX_UPCOMING_PREVIEW_ITEMS = 10;
const MAX_RESOLVED_PREVIEW_ITEMS = 100;

const TASK_PRIORITY = Object.freeze({ blocker: 0, high: 1, normal: 2 });
const TASK_LABELS = Object.freeze({
  "source-drift-review": "Review source drift",
  "re-verification": "Run fresh verification",
  "reviewer-confirmation": "Confirm passing verification",
  "recurrence-review": "Review recurring finding",
  "fresh-evidence": "Provide fresh evidence",
  "rollout-blocker": "Resolve rollout blocker",
  "finding-disposition": "Review finding disposition",
});

function taskRank(kind, severity, blocksRollout) {
  if (blocksRollout || severity === "error" && ["source-drift-review", "re-verification", "reviewer-confirmation", "recurrence-review", "fresh-evidence", "rollout-blocker"].includes(kind)) return TASK_PRIORITY.blocker;
  if (severity === "warning" || ["source-drift-review", "re-verification", "reviewer-confirmation", "recurrence-review", "fresh-evidence"].includes(kind)) return TASK_PRIORITY.high;
  return TASK_PRIORITY.normal;
}

function dateOnly(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDateDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenDates(laterDate, earlierDate) {
  const later = new Date(`${laterDate}T00:00:00.000Z`).getTime();
  const earlier = new Date(`${earlierDate}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor((later - earlier) / 86_400_000));
}

function summarizeAssigneeWorkloads(tasks, today, upcomingThrough) {
  const grouped = new Map();
  for (const item of tasks) {
    const assignee = text(item.assignee, 120);
    const key = assignee ? `assigned:${assignee.toLocaleLowerCase()}` : "unassigned";
    const existing = grouped.get(key) || {
      key,
      assignee: assignee || "Unassigned",
      taskCount: 0,
      blockingCount: 0,
      overdueCount: 0,
      overdueBlockerCount: 0,
      upcomingDeadlineCount: 0,
      affectedDecisionRecordCount: 0,
      _recordIds: new Set(),
    };
    existing.taskCount += 1;
    if (item.blocksRollout) existing.blockingCount += 1;
    if (item.isOverdue) existing.overdueCount += 1;
    if (item.isOverdue && item.blocksRollout) existing.overdueBlockerCount += 1;
    if (item.dueDate && item.dueDate >= today && item.dueDate <= upcomingThrough) existing.upcomingDeadlineCount += 1;
    if (item.recordId) existing._recordIds.add(item.recordId);
    existing.affectedDecisionRecordCount = existing._recordIds.size;
    grouped.set(key, existing);
  }
  const all = [...grouped.values()].map(({ _recordIds, ...summary }) => summary).sort((left, right) =>
    right.overdueBlockerCount - left.overdueBlockerCount
    || right.blockingCount - left.blockingCount
    || right.overdueCount - left.overdueCount
    || right.taskCount - left.taskCount
    || left.assignee.localeCompare(right.assignee));
  return {
    totalAssigneeCount: all.length,
    assigneeWorkloads: all.slice(0, MAX_ASSIGNEE_SUMMARIES),
    assigneeWorkloadsTruncated: all.length > MAX_ASSIGNEE_SUMMARIES,
  };
}

function buildUpcomingDeadlines(tasks, today, upcomingThrough) {
  const upcoming = tasks.filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= upcomingThrough)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
      || left.priorityRank - right.priorityRank
      || left.id.localeCompare(right.id));
  return {
    upcomingDeadlineCount: upcoming.length,
    upcomingDeadlines: upcoming.slice(0, MAX_UPCOMING_PREVIEW_ITEMS),
    upcomingDeadlinesTruncated: upcoming.length > MAX_UPCOMING_PREVIEW_ITEMS,
  };
}

function buildEscalationSummary(tasks, today) {
  const overdueBlockers = tasks.filter((item) => item.isOverdue && item.blocksRollout)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
      || left.priorityRank - right.priorityRank
      || left.id.localeCompare(right.id));
  const assignees = new Map();
  const records = new Set();
  let unassignedCount = 0;
  for (const item of overdueBlockers) {
    if (!item.assignee) unassignedCount += 1;
    else assignees.set(item.assignee, (assignees.get(item.assignee) || 0) + 1);
    if (item.recordId) records.add(item.recordId);
  }
  const oldestDueDate = overdueBlockers[0]?.dueDate || "";
  const acknowledgedCount = overdueBlockers.filter((item) => item.isEscalationAcknowledged).length;
  return {
    overdueBlockerCount: overdueBlockers.length,
    acknowledgedCount,
    unacknowledgedCount: overdueBlockers.length - acknowledgedCount,
    unassignedOverdueBlockerCount: unassignedCount,
    affectedDecisionRecordCount: records.size,
    oldestDueDate,
    oldestDaysOverdue: oldestDueDate ? daysBetweenDates(today, oldestDueDate) : 0,
    byAssignee: [...assignees.entries()].map(([assignee, count]) => ({ assignee, count }))
      .sort((left, right) => right.count - left.count || left.assignee.localeCompare(right.assignee))
      .slice(0, MAX_ASSIGNEE_SUMMARIES),
    items: overdueBlockers.slice(0, MAX_ESCALATION_PREVIEW_ITEMS),
    truncated: overdueBlockers.length > MAX_ESCALATION_PREVIEW_ITEMS,
  };
}

function makeItem(record, finding, data, today, upcomingThrough) {
  const severity = ["error", "warning", "info"].includes(finding.severity) ? finding.severity : "info";
  const blocksRollout = data.blocksRollout === true;
  const rank = taskRank(data.kind, severity, blocksRollout);
  const id = [record.id, finding.id, data.kind, data.runId || "no-run", data.metricKey || "no-metric", data.side || "no-side", data.fingerprint || "no-fingerprint"].map((part) => text(part, 140)).join(":");
  const taskMetadata = getRemediationTaskMetadata(record, id);
  const dueDate = taskMetadata?.dueDate || "";
  const isOverdue = Boolean(dueDate && dueDate < today);
  const isUpcomingDeadline = Boolean(dueDate && dueDate >= today && dueDate <= upcomingThrough);
  const daysOverdue = isOverdue ? daysBetweenDates(today, dueDate) : 0;
  const dueState = isOverdue ? "overdue" : dueDate === today ? "due-today" : dueDate ? "scheduled" : "not-set";
  const lifecycleFingerprint = JSON.stringify([
    id, data.kind, severity, text(finding.status || "open", 40), text(data.runId, 140),
    text(data.metricKey, 100), data.side === "after" ? "after" : data.side === "before" ? "before" : "",
    text(data.fingerprint, 40),
  ]);
  const escalationFingerprint = JSON.stringify([lifecycleFingerprint, dueDate]);
  const taskResolution = taskMetadata?.taskResolution || null;
  const isTaskResolved = Boolean(taskResolution?.status === "resolved" && taskResolution.fingerprint === lifecycleFingerprint);
  const escalationAcknowledgement = taskMetadata?.escalationAcknowledgement || null;
  const isEscalationCandidate = Boolean(isOverdue && blocksRollout);
  const isEscalationAcknowledged = Boolean(isEscalationCandidate
    && escalationAcknowledgement?.fingerprint === escalationFingerprint
    && escalationAcknowledgement?.dueDateSnapshot === dueDate);
  return {
    id,
    kind: data.kind,
    kindLabel: TASK_LABELS[data.kind] || "Review remediation",
    priority: rank === 0 ? "blocking" : rank === 1 ? "high" : "normal",
    priorityRank: rank,
    blocksRollout,
    recordId: text(record.id, 140),
    recordTitle: text(record.title || record.id || "Untitled decision", 180),
    decisionStatus: text(record.status || "proposed", 40),
    findingId: text(finding.id, 140),
    findingTitle: text(finding.title || "Untitled finding", 240),
    findingCode: text(finding.code || "unclassified", 100),
    severity,
    findingStatus: text(finding.status || "open", 40),
    owner: text(finding.owner, 120),
    assignee: text(taskMetadata?.assignee, 120),
    dueDate,
    dueState,
    isOverdue,
    isUpcomingDeadline,
    daysOverdue,
    taskMetadataUpdatedAt: text(taskMetadata?.updatedAt, 40),
    taskAuditTrail: taskMetadata?.auditTrail || [],
    escalationFingerprint,
    isEscalationCandidate,
    isEscalationAcknowledged,
    isEscalationAcknowledgementStale: Boolean(isEscalationCandidate && escalationAcknowledgement && !isEscalationAcknowledged),
    escalationAcknowledgement,
    lifecycleFingerprint,
    isTaskResolved,
    taskResolutionStale: Boolean(taskResolution?.status === "resolved" && !isTaskResolved),
    taskResolution,
    resolutionHistory: taskMetadata?.resolutionHistory || [],
    followUpNotes: taskMetadata?.followUpNotes || [],
    runId: text(data.runId, 140),
    metricKey: text(data.metricKey, 100),
    metricLabel: text(data.metricLabel, 180),
    side: data.side === "after" ? "after" : data.side === "before" ? "before" : "",
    fingerprint: text(data.fingerprint, 40),
    actionLabel: data.actionLabel || TASK_LABELS[data.kind] || "Review finding",
    reason: text(data.reason, 1000),
    updatedAt: text(finding.updatedAt || finding.createdAt, 40),
  };
}

/**
 * Build a single prioritized view of follow-up work across decision records.
 * The result is derived only; it does not merge records or mutate finding history.
 */
export function buildRemediationWorkQueue(decisionRecordsValue, { loadTestRecords = [], now = new Date() } = {}) {
  const today = dateOnly(now);
  const upcomingThrough = addDateDays(today, UPCOMING_DEADLINE_WINDOW_DAYS);
  const createItem = (record, finding, data) => makeItem(record, finding, data, today, upcomingThrough);
  const decisionRecords = (Array.isArray(decisionRecordsValue) ? decisionRecordsValue : []).filter(isRecord).slice(-50);
  const tasks = [];
  let trackedFindings = 0;

  for (const record of decisionRecords) {
    const findings = normalizeDecisionReviewFindings(record.reviewFindings);
    trackedFindings += findings.length;
    for (const finding of findings) {
      const effectiveness = buildRemediationEffectivenessSummary(finding, { loadTestRecords });
      const latestRun = effectiveness.latestRun;
      const sourceDrift = effectiveness.sourceDriftResolutionSummary;
      const tasksBeforeFinding = tasks.length;

      // Each changed source fingerprint has its own task. Reviewed material changes
      // move from a review item to a new-verification item; display-name-only changes
      // already accepted as context do not create follow-up work.
      for (const item of sourceDrift?.items || []) {
        if (item.reviewState === "reviewed-acceptable-context" && item.canAcceptAsContext) continue;
        const needsReview = !item.latestReview;
        const kind = needsReview ? "source-drift-review" : "re-verification";
        tasks.push(createItem(record, finding, {
          kind,
          runId: latestRun?.id,
          metricKey: item.metricKey,
          metricLabel: item.metricLabel,
          side: item.side,
          fingerprint: item.fingerprint,
          blocksRollout: finding.severity === "error",
          actionLabel: needsReview ? "Open source comparison" : "Open comparison and record a new run",
          reason: needsReview
            ? `${item.metricLabel} (${item.side}) source ${item.sourceRecordId || "is missing"} changed from its saved verification snapshot. Review the original and current values before relying on that run.`
            : `The reviewer marked this ${item.metricLabel} (${item.side}) source change as requiring re-verification. The old run remains historical; record a fresh run against current evidence.`,
        }));
      }

      if (finding.reoccurrence?.state === "unreviewed") {
        tasks.push(createItem(record, finding, {
          kind: "recurrence-review",
          blocksRollout: finding.severity === "error",
          actionLabel: "Open recurrence review",
          reason: `The finding reappeared in ${finding.reoccurrence.sourceBundleName || "a later release bundle"} after it was marked ${finding.reoccurrence.previousStatus || "closed"}. Review the recurrence and explicitly reopen if needed.`,
        }));
      }

      if (finding.freshEvidenceRequired && !text(finding.evidence, 1200)) {
        tasks.push(createItem(record, finding, {
          kind: "fresh-evidence",
          blocksRollout: finding.severity === "error",
          actionLabel: "Open finding and add evidence",
          reason: `Fresh supporting evidence is required after the finding was reopened. Earlier evidence is historical only.`,
        }));
      }

      const sourceFollowUpExists = tasks.slice(tasksBeforeFinding).some((task) => ["source-drift-review", "re-verification"].includes(task.kind));
      if (finding.status === "open") {
        if (finding.severity === "error") {
          tasks.push(createItem(record, finding, {
            kind: "rollout-blocker",
            blocksRollout: true,
            actionLabel: "Open blocking finding",
            reason: "This open error-severity finding blocks rollout readiness until a valid disposition is recorded.",
          }));
        } else if (!finding.reoccurrence || finding.reoccurrence.state !== "unreviewed") {
          tasks.push(createItem(record, finding, {
            kind: "finding-disposition",
            actionLabel: "Open finding review",
            reason: "This finding remains open and needs a documented disposition, owner, rationale, and supporting evidence before review can close it.",
          }));
        }
      } else if (finding.status === "resolved" && !effectiveness.isVerified && !sourceFollowUpExists && finding.reoccurrence?.state !== "unreviewed") {
        if (latestRun?.outcome === "pass" && effectiveness.status === "awaiting-confirmation") {
          tasks.push(createItem(record, finding, {
            kind: "reviewer-confirmation",
            runId: latestRun.id,
            blocksRollout: finding.severity === "error",
            actionLabel: "Open passing run for confirmation",
            reason: "A passing run is recorded, but the reviewer has not confirmed it as current remediation evidence.",
          }));
        } else {
          tasks.push(createItem(record, finding, {
            kind: "re-verification",
            runId: latestRun?.id,
            blocksRollout: finding.severity === "error",
            actionLabel: latestRun ? "Open remediation and record a new run" : "Open remediation and record a run",
            reason: effectiveness.label || "A resolved finding needs a current passing verification run and explicit reviewer confirmation.",
          }));
        }
      }
    }
  }

  const sortTasks = (taskRows) => taskRows.sort((left, right) => left.priorityRank - right.priorityRank
    || Number(right.isOverdue) - Number(left.isOverdue)
    || (left.dueDate && right.dueDate ? left.dueDate.localeCompare(right.dueDate) : left.dueDate ? -1 : right.dueDate ? 1 : 0)
    || (left.updatedAt && right.updatedAt ? (Date.parse(left.updatedAt) || 0) - (Date.parse(right.updatedAt) || 0) : 0)
    || left.recordTitle.localeCompare(right.recordTitle)
    || left.findingTitle.localeCompare(right.findingTitle)
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id));
  const ranked = sortTasks(tasks);
  const activeRanked = ranked.filter((item) => !item.isTaskResolved);
  const resolvedRanked = sortTasks(ranked.filter((item) => item.isTaskResolved));
  const items = activeRanked.slice(0, MAX_QUEUE_ITEMS);
  const resolvedItems = resolvedRanked.slice(0, MAX_RESOLVED_PREVIEW_ITEMS);
  const workloadSummary = summarizeAssigneeWorkloads(activeRanked, today, upcomingThrough);
  const upcomingSummary = buildUpcomingDeadlines(activeRanked, today, upcomingThrough);
  const escalationSummary = buildEscalationSummary(activeRanked, today);
  const handoffItems = (rows) => rows.slice(0, 12).map((item) => ({
    id: item.id,
    kind: item.kind,
    kindLabel: item.kindLabel,
    recordId: item.recordId,
    recordTitle: item.recordTitle,
    findingId: item.findingId,
    findingCode: item.findingCode,
    findingTitle: item.findingTitle,
    severity: item.severity,
    findingStatus: item.findingStatus,
    assignee: item.assignee,
    owner: item.owner,
    dueDate: item.dueDate,
    daysOverdue: item.daysOverdue,
    blocksRollout: item.blocksRollout,
    isOverdue: item.isOverdue,
    isEscalationAcknowledged: item.isEscalationAcknowledged,
    priority: item.priority,
    reason: item.reason,
  }));
  const acknowledgedHandoffBlockers = activeRanked.filter((item) => item.blocksRollout && item.isEscalationCandidate && item.isEscalationAcknowledged);
  const unresolvedFollowUps = activeRanked.filter((item) => !item.isOverdue);
  const overdueHandoffTasks = activeRanked.filter((item) => item.isOverdue);
  const resolvedTasksWithOpenFindings = resolvedRanked.filter((item) => item.findingStatus === "open");
  const handoffCategory = (rows) => ({ count: rows.length, items: handoffItems(rows), truncated: rows.length > 12 });
  const handoffSummary = {
    asOfDate: today,
    activeTaskCount: activeRanked.length,
    resolvedTaskCount: resolvedRanked.length,
    openRolloutBlockerCount: activeRanked.filter((item) => item.blocksRollout).length,
    acknowledgedBlockers: handoffCategory(acknowledgedHandoffBlockers),
    unresolvedFollowUps: handoffCategory(unresolvedFollowUps),
    overdueTasks: handoffCategory(overdueHandoffTasks),
    resolvedTasksWithOpenFindings: handoffCategory(resolvedTasksWithOpenFindings),
    disclaimer: "Derived from saved decision records and task workflow metadata. Handoff entries are not independent evidence verification or deployment approval.",
  };

  return {
    items,
    resolvedItems,
    totalCount: activeRanked.length,
    totalResolvedCount: resolvedRanked.length,
    resolvedItemsTruncated: resolvedRanked.length > MAX_RESOLVED_PREVIEW_ITEMS,
    resolvedOpenBlockerCount: resolvedRanked.filter((item) => item.blocksRollout && item.findingStatus === "open").length,
    blockingCount: activeRanked.filter((item) => item.blocksRollout).length,
    sourceDriftReviewCount: activeRanked.filter((item) => item.kind === "source-drift-review").length,
    reVerificationCount: activeRanked.filter((item) => item.kind === "re-verification").length,
    recurrenceReviewCount: activeRanked.filter((item) => item.kind === "recurrence-review").length,
    overdueCount: activeRanked.filter((item) => item.isOverdue).length,
    overdueBlockingCount: escalationSummary.overdueBlockerCount,
    unacknowledgedOverdueBlockingCount: escalationSummary.unacknowledgedCount,
    upcomingDeadlineWindowDays: UPCOMING_DEADLINE_WINDOW_DAYS,
    upcomingDeadlineThrough: upcomingThrough,
    ...workloadSummary,
    ...upcomingSummary,
    escalationSummary,
    handoffSummary,
    unassignedCount: activeRanked.filter((item) => !item.assignee).length,
    recordCount: decisionRecords.length,
    trackedFindingCount: trackedFindings,
    evaluatedDate: today,
    truncated: activeRanked.length > MAX_QUEUE_ITEMS,
    disclaimer: "Queue entries are derived from saved decision records and current load-test sources. They do not independently authenticate evidence or authorize deployment.",
  };
}

export const REMEDIATION_WORK_QUEUE_FILTERS = Object.freeze([
  { value: "all", label: "All follow-up work" },
  { value: "blocking", label: "Rollout blockers" },
  { value: "source-drift-review", label: "Source-drift reviews" },
  { value: "re-verification", label: "Re-verification" },
  { value: "recurrence-review", label: "Recurring findings" },
  { value: "overdue", label: "Overdue tasks" },
  { value: "overdue-blockers", label: "Overdue rollout blockers" },
  { value: "unacknowledged-escalations", label: "Unacknowledged overdue escalations" },
  { value: "upcoming", label: "Upcoming deadlines (7 days)" },
  { value: "resolved", label: "Resolved queue tasks" },
]);

export function filterRemediationWorkQueue(itemsValue, filter = "all", { upcomingDeadlines = [], resolvedItems = [] } = {}) {
  const items = Array.isArray(itemsValue) ? itemsValue : [];
  if (filter === "blocking") return items.filter((item) => item.blocksRollout);
  if (filter === "source-drift-review" || filter === "re-verification" || filter === "recurrence-review") return items.filter((item) => item.kind === filter);
  if (filter === "overdue") return items.filter((item) => item.isOverdue);
  if (filter === "overdue-blockers") return items.filter((item) => item.isOverdue && item.blocksRollout);
  if (filter === "unacknowledged-escalations") return items.filter((item) => item.isEscalationCandidate && !item.isEscalationAcknowledged);
  if (filter === "upcoming") return Array.isArray(upcomingDeadlines) && upcomingDeadlines.length ? upcomingDeadlines : items.filter((item) => item.isUpcomingDeadline);
  if (filter === "resolved") return Array.isArray(resolvedItems) ? resolvedItems : [];
  return items;
}
