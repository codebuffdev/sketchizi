import { acceptanceCriteriaEqual, evaluateRemediationAcceptanceCriteria, normalizeRemediationAcceptanceCriteria, normalizeRemediationMeasurements } from "./remediationAcceptanceCriteria.js";
import { evaluateRemediationMeasurementSourceDrift, evaluateRemediationMeasurementSources } from "./remediationEvidenceMapping.js";
import { canAcceptRemediationSourceDriftAsContext, fingerprintRemediationSourceDriftItem } from "./remediationSourceDriftResolution.js";

const EXPECTED_BUNDLE_TYPE = "sketchizi.workbench.release-evidence-bundle";
const EXPECTED_SCHEMA_VERSION = 1;
const MAX_FINDINGS = 80;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const finiteOrNull = (value) => value === null || (typeof value === "number" && Number.isFinite(value));
const boundedText = (value, limit = 400) => String(value ?? "").trim().slice(0, limit);

function addDateDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenDates(laterDate, earlierDate) {
  return Math.max(0, Math.floor((new Date(`${laterDate}T00:00:00.000Z`).getTime() - new Date(`${earlierDate}T00:00:00.000Z`).getTime()) / 86_400_000));
}

function deriveBundleQueueSummaries(tasks, asOfDate, upcomingThrough) {
  const groups = new Map();
  for (const task of tasks) {
    const assignee = boundedText(task.taskAssignee, 120);
    const key = assignee ? `assigned:${assignee.toLocaleLowerCase()}` : "unassigned";
    const group = groups.get(key) || {
      key, assignee: assignee || "Unassigned", taskCount: 0, blockingCount: 0,
      overdueCount: 0, overdueBlockerCount: 0, upcomingDeadlineCount: 0,
      affectedDecisionRecordCount: 0, _recordIds: new Set(),
    };
    const overdue = Boolean(task.dueDate && task.dueDate < asOfDate);
    group.taskCount += 1;
    if (task.blocksRollout === true) group.blockingCount += 1;
    if (overdue) group.overdueCount += 1;
    if (overdue && task.blocksRollout === true) group.overdueBlockerCount += 1;
    if (task.dueDate && task.dueDate >= asOfDate && task.dueDate <= upcomingThrough) group.upcomingDeadlineCount += 1;
    if (task.recordId) group._recordIds.add(task.recordId);
    group.affectedDecisionRecordCount = group._recordIds.size;
    groups.set(key, group);
  }
  const assigneeGroups = [...groups.values()].map(({ _recordIds, ...group }) => group).sort((left, right) =>
    right.overdueBlockerCount - left.overdueBlockerCount
    || right.blockingCount - left.blockingCount
    || right.overdueCount - left.overdueCount
    || right.taskCount - left.taskCount
    || left.assignee.localeCompare(right.assignee));
  const upcoming = tasks.filter((task) => task.dueDate && task.dueDate >= asOfDate && task.dueDate <= upcomingThrough)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
      || (Number.isFinite(left.priorityRank) ? left.priorityRank : 99) - (Number.isFinite(right.priorityRank) ? right.priorityRank : 99)
      || boundedText(left.id, 1000).localeCompare(boundedText(right.id, 1000)));
  const overdueBlockers = tasks.filter((task) => task.dueDate && task.dueDate < asOfDate && task.blocksRollout === true)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
      || (Number.isFinite(left.priorityRank) ? left.priorityRank : 99) - (Number.isFinite(right.priorityRank) ? right.priorityRank : 99)
      || boundedText(left.id, 1000).localeCompare(boundedText(right.id, 1000)));
  const assigneeCounts = new Map();
  const recordIds = new Set();
  for (const task of overdueBlockers) {
    const assignee = boundedText(task.taskAssignee, 120);
    if (assignee) assigneeCounts.set(assignee, (assigneeCounts.get(assignee) || 0) + 1);
    if (task.recordId) recordIds.add(task.recordId);
  }
  const oldestDueDate = overdueBlockers[0]?.dueDate || "";
  return {
    totalAssigneeCount: assigneeGroups.length,
    assigneeGroups: assigneeGroups.slice(0, 100),
    upcomingCount: upcoming.length,
    upcomingTaskIds: upcoming.slice(0, 10).map((task) => task.id),
    overdueBlockerCount: overdueBlockers.length,
    unassignedOverdueBlockerCount: overdueBlockers.filter((task) => !boundedText(task.taskAssignee, 120)).length,
    affectedDecisionRecordCount: recordIds.size,
    oldestDueDate,
    oldestDaysOverdue: oldestDueDate ? daysBetweenDates(asOfDate, oldestDueDate) : 0,
    overdueBlockerAssignees: [...assigneeCounts.entries()].map(([assignee, count]) => ({ assignee, count }))
      .sort((left, right) => right.count - left.count || left.assignee.localeCompare(right.assignee)).slice(0, 100),
    overdueBlockerTaskIds: overdueBlockers.slice(0, 5).map((task) => task.id),
  };
}

function createReview({ status, findings, bundle = null, sourceName = "Imported bundle" }) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const infoCount = findings.filter((finding) => finding.severity === "info").length;
  const record = isRecord(bundle?.decisionRecord) ? bundle.decisionRecord : {};
  const report = isRecord(record.reportSnapshot) ? record.reportSnapshot : {};
  const loadTests = isRecord(bundle?.evidenceInventory?.loadTests) ? bundle.evidenceInventory.loadTests : {};
  const metricRows = safeArray(bundle?.evidenceInventory?.simulationComparison?.metrics);
  const checks = safeArray(bundle?.readiness?.checks);
  const gates = safeArray(bundle?.evidenceInventory?.decisionValidationGates);
  const rolloutChecks = safeArray(bundle?.evidenceInventory?.rolloutChecks);
  const remediationQueue = isRecord(bundle?.remediationWorkQueue) ? bundle.remediationWorkQueue : {};
  return {
    status,
    label: status === "invalid" ? "Invalid bundle" : status === "review-required" ? "Review required" : "Structure consistent",
    sourceName: boundedText(sourceName || "Imported bundle", 180),
    bundleMetadata: {
      recordId: boundedText(record.id, 120),
      title: boundedText(record.title || "Untitled decision", 180),
      decisionStatus: boundedText(record.status, 40),
      generatedAt: boundedText(bundle?.generatedAt, 80),
      disposition: boundedText(bundle?.disposition, 80),
      readinessStatus: boundedText(bundle?.readiness?.status, 80),
    },
    counts: {
      errors: errorCount,
      warnings: warningCount,
      information: infoCount,
      checks: checks.length,
      openChecks: checks.filter((item) => item?.state !== "complete").length,
      gates: gates.length,
      openGates: gates.filter((gate) => gate?.done !== true).length,
      rolloutChecks: rolloutChecks.length,
      openRolloutChecks: rolloutChecks.filter((check) => check?.state !== "complete").length,
      simulationMetrics: metricRows.length,
      loadTestRecords: safeArray(loadTests.records).length,
      loadTestRecordsAtExport: Number.isSafeInteger(loadTests.recordCountAtExport) ? loadTests.recordCountAtExport : null,
      risks: safeArray(bundle?.riskAssessment?.reportedRisks).length + safeArray(bundle?.riskAssessment?.additionalRisks).length,
      limitations: safeArray(bundle?.riskAssessment?.limitations).length,
      trackedReviewFindings: safeArray(record.reviewFindings).length,
      openReviewFindings: safeArray(record.reviewFindings).filter((finding) => finding?.status === "open").length,
      blockingReviewFindings: safeArray(record.reviewFindings).filter((finding) => finding?.status === "open" && finding?.severity === "error").length,
      acceptedRiskFindings: safeArray(record.reviewFindings).filter((finding) => finding?.status === "accepted-risk").length,
      resolvedReviewFindings: safeArray(record.reviewFindings).filter((finding) => finding?.status === "resolved").length,
      unreviewedReoccurrences: safeArray(record.reviewFindings).filter((finding) => finding?.reoccurrence?.state === "unreviewed").length,
      reoccurrenceBlockers: safeArray(record.reviewFindings).filter((finding) => finding?.reoccurrence?.state === "unreviewed" && finding?.severity === "error").length,
      remediationQueueTasks: nonNegativeInteger(remediationQueue.taskCount) ? remediationQueue.taskCount : 0,
      overdueRemediationTasks: nonNegativeInteger(remediationQueue.overdueCount) ? remediationQueue.overdueCount : 0,
      unassignedRemediationTasks: nonNegativeInteger(remediationQueue.unassignedCount) ? remediationQueue.unassignedCount : 0,
    },
    findings: findings.slice(0, MAX_FINDINGS),
    interpretation: "This review checks JSON structure and internal consistency only. It does not verify signatures, provenance, measurement authenticity, external evidence references, or production safety.",
    sourceReportLoadTestCount: nonNegativeInteger(report.loadTestRecordsCount) ? report.loadTestRecordsCount : null,
  };
}

/**
 * Inspect an exported release evidence bundle. Findings concern structure and
 * consistency only; this function deliberately makes no authenticity claims.
 * Accepts an already-parsed object or raw JSON text and never mutates the input.
 */
export function reviewReleaseEvidenceBundle(input, { sourceName = "Imported bundle" } = {}) {
  let bundle = input;
  const findings = [];
  const add = (severity, code, title, detail) => {
    if (findings.some((item) => item.code === code && item.title === title && item.detail === detail)) return;
    findings.push({ severity, code, title, detail: boundedText(detail, 1000) });
  };

  if (typeof input === "string") {
    try {
      bundle = JSON.parse(input);
    } catch (error) {
      add("error", "json-parse", "Could not parse JSON", `The selected file is not valid JSON: ${error?.message || "parse error"}`);
      return createReview({ status: "invalid", findings, sourceName });
    }
  }

  if (!isRecord(bundle)) {
    add("error", "root-type", "Bundle root must be a JSON object", "The imported content must contain one top-level object.");
    return createReview({ status: "invalid", findings, sourceName });
  }

  if (bundle.bundleType !== EXPECTED_BUNDLE_TYPE) {
    add("error", "bundle-type", "Unsupported bundle type", `Expected '${EXPECTED_BUNDLE_TYPE}'. Found '${boundedText(bundle.bundleType || "missing", 120)}'.`);
  }
  if (bundle.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    add("error", "schema-version", "Unsupported schema version", `This reviewer supports schema version ${EXPECTED_SCHEMA_VERSION}; found '${String(bundle.schemaVersion ?? "missing")}'.`);
  }

  const requiredObjects = [
    ["decisionRecord", "Saved decision record"],
    ["readiness", "Readiness assessment"],
    ["evidenceInventory", "Evidence inventory"],
    ["riskAssessment", "Risk assessment"],
  ];
  for (const [key, label] of requiredObjects) {
    if (!isRecord(bundle[key])) add("error", `missing-${key}`, `Missing ${label.toLowerCase()}`, `Required top-level field '${key}' is missing or is not an object.`);
  }
  if (!isRecord(bundle.decisionRecord)) {
    return createReview({ status: "invalid", findings, bundle, sourceName });
  }

  const record = bundle.decisionRecord;
  const report = record.reportSnapshot;
  const readiness = bundle.readiness;
  const inventory = bundle.evidenceInventory;
  const riskAssessment = bundle.riskAssessment;
  if (!boundedText(record.id, 120)) add("error", "missing-record-id", "Decision record ID is missing", "The saved decisionRecord.id must be a non-empty string.");
  if (!boundedText(record.title, 180)) add("warning", "missing-decision-title", "Decision title is missing", "A descriptive decision title helps reviewers identify this proposal.");
  if (!boundedText(record.owner, 120)) add("warning", "missing-decision-owner", "Decision owner is missing", "The bundle should identify the engineering owner accountable for the recorded decision.");
  if (!boundedText(record.rationale, 2000)) add("warning", "missing-decision-rationale", "Decision rationale is missing", "The bundle should preserve why the decision was proposed, accepted, rejected, or deferred.");
  if (!["proposed", "accepted", "rejected", "deferred"].includes(record.status)) add("warning", "decision-status", "Decision status is unrecognized", `Decision status '${boundedText(record.status || "missing", 80)}' is not one of the supported lifecycle values.`);
  if (!Array.isArray(record.auditTrail)) add("warning", "audit-trail-type", "Decision audit trail is missing", "decisionRecord.auditTrail should be an array, even when no audit events are recorded.");
  if (Object.hasOwn(record, "handoffNotes")) {
    if (!Array.isArray(record.handoffNotes)) {
      add("warning", "handoff-notes-type", "Escalation handoff notes are malformed", "decisionRecord.handoffNotes should be an array when present.");
    } else {
      const seenHandoffNoteIds = new Set();
      for (const [handoffIndex, note] of record.handoffNotes.entries()) {
        if (!isRecord(note) || !boundedText(note.id, 160) || !boundedText(note.author, 120)
          || !boundedText(note.note, 1800) || typeof note.createdAt !== "string" || Number.isNaN(Date.parse(note.createdAt))) {
          add("warning", `handoff-note-malformed-${handoffIndex}`, "An escalation handoff note is incomplete", "Each note needs an ID, author, timestamp, and handoff text. Incomplete notes remain untrusted coordination context.");
          continue;
        }
        if (seenHandoffNoteIds.has(note.id)) add("warning", `handoff-note-duplicate-${handoffIndex}`, "Escalation handoff note IDs are duplicated", `Handoff note '${boundedText(note.id, 160)}' appears more than once.`);
        seenHandoffNoteIds.add(note.id);
        if (note.independentlyVerified === true) add("warning", `handoff-note-verification-claim-${handoffIndex}`, "A manual handoff note claims independent verification", `Handoff note '${boundedText(note.id, 160)}' is manual coordination context and cannot claim independent verification.`);
        if (note.receipt !== null && note.receipt !== undefined) {
          const receipt = note.receipt;
          if (!isRecord(receipt) || !boundedText(receipt.reviewer, 120)
            || !["received", "received-with-follow-up", "not-received"].includes(receipt.status)
            || typeof receipt.recordedAt !== "string" || Number.isNaN(Date.parse(receipt.recordedAt))) {
            add("warning", `handoff-receipt-malformed-${handoffIndex}`, "A handoff receipt attestation is malformed", `Handoff note '${boundedText(note.id, 160)}' receipt metadata needs a reviewer, supported status, and valid timestamp.`);
          } else if (receipt.independentlyVerified === true || receipt.classification !== "manual-handoff-receipt-attestation") {
            add("warning", `handoff-receipt-verification-claim-${handoffIndex}`, "A handoff receipt overstates its verification status", `Handoff note '${boundedText(note.id, 160)}' receipt is manual metadata and cannot prove delivery or independent verification.`);
          }
        }
        if (note.summarySnapshot !== null && note.summarySnapshot !== undefined) {
          const snapshot = note.summarySnapshot;
          const categoryKeys = ["acknowledgedBlockers", "unresolvedFollowUps", "overdueTasks", "resolvedTasksWithOpenFindings"];
          if (!isRecord(snapshot) || !/^\d{4}-\d{2}-\d{2}$/.test(boundedText(snapshot.asOfDate, 10))
            || !nonNegativeInteger(snapshot.activeTaskCount) || !nonNegativeInteger(snapshot.resolvedTaskCount)
            || !nonNegativeInteger(snapshot.openRolloutBlockerCount) || !isRecord(snapshot.counts) || !isRecord(snapshot.references)
            || categoryKeys.some((key) => !nonNegativeInteger(snapshot.counts?.[key]) || !Array.isArray(snapshot.references?.[key]))) {
            add("warning", `handoff-note-snapshot-${handoffIndex}`, "A handoff note queue snapshot is malformed", `Handoff note '${boundedText(note.id, 160)}' must preserve a dated queue snapshot with valid category counts and reference arrays.`);
          }
        }
      }
      if (record.handoffNotes.length > 30) add("warning", "handoff-note-limit", "Handoff note history exceeds the supported limit", "The decision record supports the 30 most recent normalized handoff notes; review this export for unexpected older entries.");
    }
  }
  if (typeof bundle.generatedAt !== "string" || Number.isNaN(Date.parse(bundle.generatedAt))) add("warning", "generated-at-invalid", "Bundle generation time is missing or invalid", "generatedAt should be a parseable timestamp so the review can identify when this export was produced.");
  if (!isRecord(report)) add("error", "missing-report-snapshot", "Decision report snapshot is missing", "decisionRecord.reportSnapshot must be an object.");
  if (Object.hasOwn(record, "workQueueTasks")) {
    if (!Array.isArray(record.workQueueTasks)) {
      add("warning", "work-queue-task-metadata-type", "Task planning metadata is malformed", "decisionRecord.workQueueTasks must be an array when present.");
    } else {
      const seenTaskIds = new Set();
      for (const [taskIndex, task] of record.workQueueTasks.entries()) {
        if (!isRecord(task) || !boundedText(task.taskId, 1000)) {
          add("warning", `work-queue-task-metadata-${taskIndex}`, "A saved task planning entry is malformed", `Task entry ${taskIndex + 1} must contain a stable taskId.`);
          continue;
        }
        if (seenTaskIds.has(task.taskId)) add("warning", `work-queue-task-duplicate-${taskIndex}`, "Duplicate task planning entry", `Task '${boundedText(task.taskId, 200)}' appears more than once in decisionRecord.workQueueTasks.`);
        seenTaskIds.add(task.taskId);
        if (typeof task.assignee !== "string" || task.assignee.length > 120) add("warning", `work-queue-task-assignee-${taskIndex}`, "Task assignee is malformed", `Task '${boundedText(task.taskId, 160)}' should preserve an assignee string bounded to 120 characters.`);
        if (task.dueDate && (typeof task.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || Number.isNaN(Date.parse(`${task.dueDate}T00:00:00.000Z`)) || new Date(`${task.dueDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== task.dueDate)) {
          add("warning", `work-queue-task-due-date-${taskIndex}`, "Task due date is invalid", `Task '${boundedText(task.taskId, 160)}' has a due date that is not a valid YYYY-MM-DD calendar date.`);
        }
        if (!Array.isArray(task.auditTrail)) add("warning", `work-queue-task-audit-${taskIndex}`, "Task-level audit history is missing", `Task '${boundedText(task.taskId, 160)}' should preserve an auditTrail array.`);
      }
    }
  }
  const bundleQueue = isRecord(bundle.remediationWorkQueue) ? bundle.remediationWorkQueue : null;
  if (bundleQueue) {
    const queueTasks = safeArray(bundleQueue.tasks);
    if (!Array.isArray(bundleQueue.tasks)) add("warning", "work-queue-items-type", "Derived remediation queue is malformed", "remediationWorkQueue.tasks should be an array.");
    if (!nonNegativeInteger(bundleQueue.taskCount) || !nonNegativeInteger(bundleQueue.displayedTaskCount)
      || bundleQueue.displayedTaskCount !== queueTasks.length || bundleQueue.taskCount < bundleQueue.displayedTaskCount
      || (!bundleQueue.truncated && bundleQueue.taskCount !== bundleQueue.displayedTaskCount)) {
      add("warning", "work-queue-counts", "Remediation queue counts are inconsistent", "Task total, displayed count, truncation flag and task array length must agree.");
    }
    const resolvedQueueTasks = safeArray(bundleQueue.resolvedTasks);
    if (Object.hasOwn(bundleQueue, "resolvedTasks") && !Array.isArray(bundleQueue.resolvedTasks)) {
      add("warning", "work-queue-resolved-items-type", "Resolved queue task list is malformed", "remediationWorkQueue.resolvedTasks must be an array when present.");
    }
    if (Object.hasOwn(bundleQueue, "resolvedTaskCount")) {
      if (!nonNegativeInteger(bundleQueue.resolvedTaskCount) || !nonNegativeInteger(bundleQueue.displayedResolvedTaskCount)
        || typeof bundleQueue.resolvedTasksTruncated !== "boolean"
        || bundleQueue.displayedResolvedTaskCount !== resolvedQueueTasks.length
        || bundleQueue.resolvedTaskCount < bundleQueue.displayedResolvedTaskCount
        || (!bundleQueue.resolvedTasksTruncated && bundleQueue.resolvedTaskCount !== bundleQueue.displayedResolvedTaskCount)) {
        add("warning", "work-queue-resolved-counts", "Resolved queue task counts are inconsistent", "Total, displayed count, truncation flag and resolved task rows must agree.");
      }
      const resolvedIds = new Set();
      for (const [resolvedIndex, task] of resolvedQueueTasks.entries()) {
        if (!isRecord(task) || !boundedText(task.id, 1000)) {
          add("warning", `work-queue-resolved-task-${resolvedIndex}`, "A resolved queue task is malformed", `Resolved task ${resolvedIndex + 1} must have a stable ID.`);
          continue;
        }
        if (resolvedIds.has(task.id)) add("warning", `work-queue-resolved-duplicate-${resolvedIndex}`, "Resolved queue task IDs are duplicated", `Resolved task '${boundedText(task.id, 180)}' appears more than once.`);
        resolvedIds.add(task.id);
        if (task.taskResolutionStatus !== "resolved" || !isRecord(task.taskResolution)
          || task.taskResolution.status !== "resolved" || !boundedText(task.lifecycleFingerprint, 500)
          || task.taskResolution.fingerprint !== task.lifecycleFingerprint || task.taskResolutionStale === true) {
          add("warning", `work-queue-resolved-state-${resolvedIndex}`, "A resolved task does not match its current lifecycle fingerprint", `Task '${boundedText(task.id, 180)}' cannot be treated as currently resolved unless its saved resolution fingerprint matches the current task.`);
        }
        const metadata = safeArray(record.workQueueTasks).find((entry) => entry?.taskId === task.id);
        if (JSON.stringify(metadata?.taskResolution || null) !== JSON.stringify(task.taskResolution || null)
          || JSON.stringify(metadata?.resolutionHistory || []) !== JSON.stringify(task.resolutionHistory || [])
          || JSON.stringify(metadata?.followUpNotes || []) !== JSON.stringify(task.followUpNotes || [])) {
          add("warning", `work-queue-resolved-metadata-${resolvedIndex}`, "Resolved task history differs from saved task metadata", `Resolved task '${boundedText(task.id, 180)}' resolution or follow-up history does not match the decision record.`);
        }
      }
      if (resolvedQueueTasks.some((task) => queueTasks.some((active) => active?.id === task?.id))) {
        add("warning", "work-queue-active-resolved-overlap", "A queue task appears as both active and resolved", "A task ID must appear in only one of the active or resolved task arrays.");
      }
      if (bundleQueue.resolvedOpenBlockerCount !== undefined && (!nonNegativeInteger(bundleQueue.resolvedOpenBlockerCount)
        || (!bundleQueue.resolvedTasksTruncated && bundleQueue.resolvedOpenBlockerCount !== resolvedQueueTasks.filter((task) => task?.blocksRollout === true && task?.findingStatus === "open").length))) {
        add("warning", "work-queue-resolved-open-blocker-count", "Resolved task blocker summary is inconsistent", "The count of queue tasks resolved while the underlying error finding remains open must match the complete resolved task list.");
      }
    }
    const handoffSummary = isRecord(bundleQueue.handoffSummary) ? bundleQueue.handoffSummary : null;
    const handoffCategoryKeys = ["acknowledgedBlockers", "unresolvedFollowUps", "overdueTasks", "resolvedTasksWithOpenFindings"];
    if (Object.hasOwn(bundleQueue, "handoffSummary") && !handoffSummary) {
      add("warning", "work-queue-handoff-summary-type", "Escalation handoff summary is malformed", "remediationWorkQueue.handoffSummary must be an object when present.");
    }
    if (handoffSummary) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(boundedText(handoffSummary.asOfDate, 10))
        || !nonNegativeInteger(handoffSummary.activeTaskCount) || !nonNegativeInteger(handoffSummary.resolvedTaskCount)
        || !nonNegativeInteger(handoffSummary.openRolloutBlockerCount)) {
        add("warning", "work-queue-handoff-summary-counts", "Escalation handoff summary counts are malformed", "The handoff summary should include a date and non-negative active, resolved, and rollout-blocker counts.");
      }
      if (handoffSummary.activeTaskCount !== bundleQueue.taskCount || handoffSummary.resolvedTaskCount !== (bundleQueue.resolvedTaskCount ?? resolvedQueueTasks.length)
        || (Object.hasOwn(bundleQueue, "blockingTaskCount") && handoffSummary.openRolloutBlockerCount !== bundleQueue.blockingTaskCount)) {
        add("warning", "work-queue-handoff-summary-total-mismatch", "Escalation handoff totals disagree with queue totals", "Active tasks, resolved tasks, and open rollout-blocker counts should match the corresponding queue totals.");
      }
      for (const key of handoffCategoryKeys) {
        const category = handoffSummary[key];
        if (!isRecord(category) || !nonNegativeInteger(category.count) || !Array.isArray(category.items)
          || typeof category.truncated !== "boolean" || category.count < category.items.length
          || category.items.length > 12 || category.truncated !== (category.count > category.items.length)) {
          add("warning", `work-queue-handoff-category-${key}`, `Escalation handoff category is malformed: ${key}`, "Each category must include a non-negative count, at most 12 preview items, and a consistent truncation flag.");
          continue;
        }
        const handoffIds = new Set();
        for (const [handoffItemIndex, item] of category.items.entries()) {
          if (!isRecord(item) || !boundedText(item.id, 1000) || !boundedText(item.recordId, 140) || !boundedText(item.findingId, 140)) {
            add("warning", `work-queue-handoff-item-${key}-${handoffItemIndex}`, `Escalation handoff item is malformed: ${key}`, "Each handoff task preview must retain task, decision record, and finding identifiers.");
            continue;
          }
          if (handoffIds.has(item.id)) add("warning", `work-queue-handoff-duplicate-${key}-${handoffItemIndex}`, `Escalation handoff task is duplicated: ${key}`, `Task '${boundedText(item.id, 180)}' appears more than once in the category preview.`);
          handoffIds.add(item.id);
        }
      }
      if (!bundleQueue.truncated && !bundleQueue.resolvedTasksTruncated && Array.isArray(bundleQueue.tasks) && Array.isArray(bundleQueue.resolvedTasks)) {
        const expectedHandoffCounts = {
          acknowledgedBlockers: queueTasks.filter((task) => task?.blocksRollout === true && task?.isEscalationCandidate === true && task?.isEscalationAcknowledged === true),
          unresolvedFollowUps: queueTasks.filter((task) => task?.isOverdue !== true),
          overdueTasks: queueTasks.filter((task) => task?.isOverdue === true),
          resolvedTasksWithOpenFindings: resolvedQueueTasks.filter((task) => task?.findingStatus === "open"),
        };
        for (const key of handoffCategoryKeys) {
          const category = handoffSummary[key];
          const expected = expectedHandoffCounts[key] || [];
          if (isRecord(category) && (category.count !== expected.length
            || JSON.stringify(safeArray(category.items).map((item) => item?.id)) !== JSON.stringify(expected.slice(0, 12).map((item) => item?.id)))) {
            add("warning", `work-queue-handoff-summary-mismatch-${key}`, `Escalation handoff summary is inconsistent: ${key}`, "Category counts and ordered preview IDs must be recalculated from the complete active/resolved queue tasks.");
          }
        }
      }
    }
    const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(boundedText(bundleQueue.asOfDate, 10)) ? bundleQueue.asOfDate : "";
    if (!asOfDate) add("warning", "work-queue-as-of-date", "Remediation queue evaluation date is missing", "The bundle should record the date used to calculate due and overdue indicators.");
    const upcomingSummary = isRecord(bundleQueue.upcomingDeadlineSummary) ? bundleQueue.upcomingDeadlineSummary : null;
    const upcomingWindowDays = upcomingSummary?.windowDays;
    const upcomingThrough = asOfDate && Number.isSafeInteger(upcomingWindowDays) && upcomingWindowDays >= 0 && upcomingWindowDays <= 31
      ? addDateDays(asOfDate, upcomingWindowDays) : "";
    if (upcomingSummary && (!upcomingThrough || upcomingSummary.throughDate !== upcomingThrough)) {
      add("warning", "work-queue-upcoming-window", "Upcoming-deadline window is inconsistent", "The through date must match the evaluation date plus the declared upcoming-deadline window.");
    }
    for (const [taskIndex, task] of queueTasks.entries()) {
      if (!isRecord(task) || !boundedText(task.id, 1000)) {
        add("warning", `work-queue-task-${taskIndex}`, "A derived remediation queue item is malformed", `Queue task ${taskIndex + 1} must include an ID.`);
        continue;
      }
      const expectedOverdue = Boolean(task.dueDate && asOfDate && task.dueDate < asOfDate);
      if (task.isOverdue !== expectedOverdue || task.dueState !== (expectedOverdue ? "overdue" : task.dueDate === asOfDate ? "due-today" : task.dueDate ? "scheduled" : "not-set")) {
        add("warning", `work-queue-due-state-${taskIndex}`, "Task due status is inconsistent", `Task '${boundedText(task.id, 180)}' has a due-state summary that does not match its due date and queue evaluation date.`);
      }
      if (upcomingSummary && task.isUpcomingDeadline !== Boolean(task.dueDate && asOfDate && upcomingThrough && task.dueDate >= asOfDate && task.dueDate <= upcomingThrough)) {
        add("warning", `work-queue-upcoming-state-${taskIndex}`, "Task upcoming status is inconsistent", `Task '${boundedText(task.id, 180)}' has an upcoming-deadline flag that does not match its due date and declared window.`);
      }
      if (Object.hasOwn(task, "daysOverdue") && task.daysOverdue !== (expectedOverdue && asOfDate ? daysBetweenDates(asOfDate, task.dueDate) : 0)) {
        add("warning", `work-queue-days-overdue-${taskIndex}`, "Task overdue duration is inconsistent", `Task '${boundedText(task.id, 180)}' has a days-overdue value that does not match its due date.`);
      }
      const metadata = safeArray(record.workQueueTasks).find((entry) => entry?.taskId === task.id);
      if ((metadata?.assignee || "") !== (task.taskAssignee || "") || (metadata?.dueDate || "") !== (task.dueDate || "")) {
        add("warning", `work-queue-task-metadata-mismatch-${taskIndex}`, "Derived task details differ from saved planning metadata", `Queue task '${boundedText(task.id, 180)}' assignment or due date does not match its decisionRecord.workQueueTasks entry.`);
      }
      if (Object.hasOwn(task, "isEscalationAcknowledged")) {
        const acknowledgement = isRecord(task.escalationAcknowledgement) ? task.escalationAcknowledgement : null;
        const expectedAcknowledged = task.isOverdue === true && task.blocksRollout === true
          && acknowledgement?.fingerprint === task.escalationFingerprint && acknowledgement?.dueDateSnapshot === task.dueDate;
        if (task.isEscalationAcknowledged !== expectedAcknowledged
          || JSON.stringify(metadata?.escalationAcknowledgement || null) !== JSON.stringify(acknowledgement)) {
          add("warning", `work-queue-escalation-acknowledgement-${taskIndex}`, "Escalation acknowledgement is stale or inconsistent", `Task '${boundedText(task.id, 180)}' acknowledgement must match its exact overdue state and saved decision-record metadata.`);
        }
      }
      if (Object.hasOwn(task, "taskResolutionStatus")) {
        const resolution = isRecord(task.taskResolution) ? task.taskResolution : null;
        if ((metadata?.taskResolution?.status || "open") !== (task.taskResolutionStatus || "open")
          || JSON.stringify(metadata?.taskResolution || null) !== JSON.stringify(resolution)
          || JSON.stringify(metadata?.resolutionHistory || []) !== JSON.stringify(task.resolutionHistory || [])
          || (task.taskResolutionStatus === "resolved" && task.taskResolutionStale !== true)) {
          add("warning", `work-queue-task-resolution-${taskIndex}`, "Active task resolution metadata is inconsistent", `Task '${boundedText(task.id, 180)}' must not be treated as resolved in the active queue unless its saved lifecycle fingerprint is stale.`);
        }
      }
      if (Object.hasOwn(task, "followUpNotes") && JSON.stringify(metadata?.followUpNotes || []) !== JSON.stringify(task.followUpNotes || [])) {
        add("warning", `work-queue-follow-up-notes-${taskIndex}`, "Follow-up note history differs from saved task metadata", `Task '${boundedText(task.id, 180)}' follow-up notes do not match decisionRecord.workQueueTasks.`);
      }
      if (!Array.isArray(task.taskAuditTrail)) add("warning", `work-queue-task-history-${taskIndex}`, "Derived task audit history is missing", `Queue task '${boundedText(task.id, 180)}' should preserve its taskAuditTrail array.`);
    }
    const assigneeSummary = isRecord(bundleQueue.assigneeSummary) ? bundleQueue.assigneeSummary : null;
    if (assigneeSummary) {
      if (!nonNegativeInteger(assigneeSummary.totalAssigneeCount) || !Array.isArray(assigneeSummary.groups)
        || typeof assigneeSummary.truncated !== "boolean" || assigneeSummary.scope !== "all-derived-tasks-for-exported-record") {
        add("warning", "work-queue-assignee-summary-shape", "Assignee workload summary is malformed", "The summary must declare group rows, a non-negative total, truncation state, and all-derived-tasks scope.");
      }
    }
    const escalationSummary = isRecord(bundleQueue.overdueBlockerEscalation) ? bundleQueue.overdueBlockerEscalation : null;
    if (escalationSummary && (!nonNegativeInteger(escalationSummary.overdueBlockerCount)
      || (Object.hasOwn(escalationSummary, "acknowledgedCount") && !nonNegativeInteger(escalationSummary.acknowledgedCount))
      || (Object.hasOwn(escalationSummary, "unacknowledgedCount") && !nonNegativeInteger(escalationSummary.unacknowledgedCount))
      || !nonNegativeInteger(escalationSummary.unassignedCount)
      || !nonNegativeInteger(escalationSummary.affectedDecisionRecordCount)
      || !nonNegativeInteger(escalationSummary.oldestDaysOverdue)
      || !Array.isArray(escalationSummary.byAssignee) || !Array.isArray(escalationSummary.taskIds)
      || typeof escalationSummary.truncated !== "boolean"
      || (Object.hasOwn(escalationSummary, "previews") && (!Array.isArray(escalationSummary.previews) || escalationSummary.previews.length !== escalationSummary.taskIds.length)))) {
      add("warning", "work-queue-escalation-summary-shape", "Overdue-blocker escalation summary is malformed", "The escalation summary should include valid counts, an assignee breakdown, preview IDs, and truncation state.");
    }
    if (upcomingSummary && (!nonNegativeInteger(upcomingSummary.totalCount) || !nonNegativeInteger(upcomingSummary.displayedCount)
      || !Array.isArray(upcomingSummary.taskIds) || typeof upcomingSummary.truncated !== "boolean"
      || upcomingSummary.displayedCount !== upcomingSummary.taskIds.length || upcomingSummary.totalCount < upcomingSummary.displayedCount
      || (Object.hasOwn(upcomingSummary, "previews") && (!Array.isArray(upcomingSummary.previews) || upcomingSummary.previews.length !== upcomingSummary.taskIds.length)))) {
      add("warning", "work-queue-upcoming-summary-shape", "Upcoming-deadline summary is malformed", "The upcoming-deadline counts, preview IDs, and truncation flag must agree.");
    }
    if (upcomingSummary && Array.isArray(upcomingSummary.previews)) {
      const previewIds = upcomingSummary.previews.map((item) => item?.id);
      if (JSON.stringify(previewIds) !== JSON.stringify(upcomingSummary.taskIds)) {
        add("warning", "work-queue-upcoming-preview-ids", "Upcoming-deadline preview IDs are inconsistent", "Preview rows must correspond in order to the declared upcoming task IDs.");
      }
      for (const [index, preview] of upcomingSummary.previews.entries()) {
        if (!isRecord(preview) || !boundedText(preview.id, 1000) || !preview.dueDate || !asOfDate || !upcomingThrough
          || preview.dueDate < asOfDate || preview.dueDate > upcomingThrough) {
          add("warning", `work-queue-upcoming-preview-${index}`, "An upcoming-deadline preview is invalid", "Preview rows must describe a task with a due date inside the declared upcoming window.");
        }
      }
    }
    if (escalationSummary && Array.isArray(escalationSummary.previews)) {
      const previewIds = escalationSummary.previews.map((item) => item?.id);
      if (JSON.stringify(previewIds) !== JSON.stringify(escalationSummary.taskIds)) {
        add("warning", "work-queue-escalation-preview-ids", "Escalation preview IDs are inconsistent", "Escalation preview rows must correspond in order to the declared overdue blocker task IDs.");
      }
      for (const [index, preview] of escalationSummary.previews.entries()) {
        if (!isRecord(preview) || !boundedText(preview.id, 1000) || preview.blocksRollout !== true
          || !preview.dueDate || !asOfDate || preview.dueDate >= asOfDate
          || preview.daysOverdue !== daysBetweenDates(asOfDate, preview.dueDate)) {
          add("warning", `work-queue-escalation-preview-${index}`, "An overdue-blocker preview is invalid", "Escalation preview rows must be overdue rollout blockers with a consistent days-overdue value.");
        }
      }
    }
    if (!bundleQueue.truncated) {
      const actualOverdue = queueTasks.filter((task) => task?.isOverdue === true).length;
      const actualUnassigned = queueTasks.filter((task) => !boundedText(task?.taskAssignee, 120)).length;
      if (assigneeSummary && asOfDate && upcomingThrough) {
        const derived = deriveBundleQueueSummaries(queueTasks, asOfDate, upcomingThrough);
        const actualGroups = safeArray(assigneeSummary.groups).map((group) => ({
          key: group?.key, assignee: group?.assignee, taskCount: group?.taskCount,
          blockingCount: group?.blockingCount, overdueCount: group?.overdueCount,
          overdueBlockerCount: group?.overdueBlockerCount, upcomingDeadlineCount: group?.upcomingDeadlineCount,
          affectedDecisionRecordCount: group?.affectedDecisionRecordCount,
        }));
        const expectedGroups = derived.assigneeGroups.map(({ _recordIds, ...group }) => group);
        if (assigneeSummary.totalAssigneeCount !== derived.totalAssigneeCount
          || assigneeSummary.truncated !== (derived.totalAssigneeCount > safeArray(assigneeSummary.groups).length)
          || JSON.stringify(actualGroups) !== JSON.stringify(expectedGroups)) {
          add("warning", "work-queue-assignee-summary-mismatch", "Assignee workload summaries are inconsistent", "Per-assignee task, blocker, overdue, upcoming-deadline, and affected-record counts should be recalculated from all displayed queue tasks.");
        }
        if (upcomingSummary && (upcomingSummary.totalCount !== derived.upcomingCount
          || upcomingSummary.displayedCount !== derived.upcomingTaskIds.length
          || JSON.stringify(upcomingSummary.taskIds) !== JSON.stringify(derived.upcomingTaskIds)
          || upcomingSummary.truncated !== (derived.upcomingCount > safeArray(upcomingSummary.taskIds).length))) {
          add("warning", "work-queue-upcoming-summary-mismatch", "Upcoming-deadline summary is inconsistent", "The upcoming-deadline count and ordered preview should match the task due dates and declared window.");
        }
        if (upcomingSummary && Array.isArray(upcomingSummary.previews)) {
          const sourceById = new Map(queueTasks.map((task) => [task.id, task]));
          const previewMismatch = upcomingSummary.previews.some((preview) => {
            const source = sourceById.get(preview?.id);
            return !source || source.dueDate !== preview.dueDate || (source.taskAssignee || "") !== (preview.taskAssignee || "")
              || source.findingTitle !== preview.findingTitle || source.recordId !== preview.recordId;
          });
          if (previewMismatch) add("warning", "work-queue-upcoming-preview-mismatch", "Upcoming-deadline preview differs from a queue task", "Upcoming preview fields must agree with the matching derived task when the queue is not truncated.");
        }
        if (escalationSummary && Array.isArray(escalationSummary.previews)) {
          const sourceById = new Map(queueTasks.map((task) => [task.id, task]));
          const previewMismatch = escalationSummary.previews.some((preview) => {
            const source = sourceById.get(preview?.id);
            return !source || source.dueDate !== preview.dueDate || source.blocksRollout !== preview.blocksRollout
              || (source.taskAssignee || "") !== (preview.taskAssignee || "") || source.daysOverdue !== preview.daysOverdue;
          });
          if (previewMismatch) add("warning", "work-queue-escalation-preview-mismatch", "Escalation preview differs from a queue task", "Escalation preview fields must agree with the matching derived task when the queue is not truncated.");
        }
        if (escalationSummary && (escalationSummary.overdueBlockerCount !== derived.overdueBlockerCount
          || escalationSummary.unassignedCount !== derived.unassignedOverdueBlockerCount
          || escalationSummary.affectedDecisionRecordCount !== derived.affectedDecisionRecordCount
          || escalationSummary.oldestDueDate !== (derived.oldestDueDate || null)
          || escalationSummary.oldestDaysOverdue !== derived.oldestDaysOverdue
          || JSON.stringify(escalationSummary.byAssignee) !== JSON.stringify(derived.overdueBlockerAssignees)
          || JSON.stringify(escalationSummary.taskIds) !== JSON.stringify(derived.overdueBlockerTaskIds)
          || escalationSummary.truncated !== (derived.overdueBlockerCount > safeArray(escalationSummary.taskIds).length))) {
          add("warning", "work-queue-escalation-summary-mismatch", "Overdue-blocker escalation summary is inconsistent", "Overdue blocker counts, assignees, affected records, oldest due date, and preview must match current queue task data.");
        }
        if (escalationSummary && Object.hasOwn(escalationSummary, "acknowledgedCount")) {
          const acknowledgedCount = queueTasks.filter((task) => task?.isOverdue === true && task?.blocksRollout === true && task?.isEscalationAcknowledged === true).length;
          const unacknowledgedCount = derived.overdueBlockerCount - acknowledgedCount;
          if (escalationSummary.acknowledgedCount !== acknowledgedCount || escalationSummary.unacknowledgedCount !== unacknowledgedCount
            || bundleQueue.unacknowledgedEscalationCount !== unacknowledgedCount) {
            add("warning", "work-queue-escalation-acknowledgement-count", "Escalation acknowledgement counts are inconsistent", "Acknowledged and unacknowledged counts must be recalculated from current overdue blocker tasks.");
          }
        }
      }
      const actualOverdueBlockers = queueTasks.filter((task) => task?.isOverdue === true && task?.blocksRollout === true).length;
      if (bundleQueue.overdueBlockingCount !== undefined && bundleQueue.overdueBlockingCount !== actualOverdueBlockers) {
        add("warning", "work-queue-overdue-blocker-count", "Overdue blocker count is inconsistent", "The overdue blocker count must match queue tasks when the queue is not truncated.");
      }
      if (bundleQueue.overdueCount !== actualOverdue) add("warning", "work-queue-overdue-count", "Overdue task count is inconsistent", "The summary overdue count must match derived queue items when the queue is not truncated.");
      if (bundleQueue.unassignedCount !== actualUnassigned) add("warning", "work-queue-unassigned-count", "Unassigned task count is inconsistent", "The summary unassigned count must match active queue items when the queue is not truncated.");
      const additionalRisks = safeArray(riskAssessment?.additionalRisks).map((risk) => boundedText(risk, 1000));
      if (actualOverdue && !additionalRisks.some((risk) => /active remediation work queue task\(s\) are overdue/i.test(risk))) {
        add("warning", "work-queue-overdue-risk-missing", "Overdue work is omitted from the risk summary", "The release bundle contains overdue remediation tasks but does not list them in its additional risk assessment.");
      }
      if (actualUnassigned && !additionalRisks.some((risk) => /active remediation work queue task\(s\) have no task-level assignee/i.test(risk))) {
        add("warning", "work-queue-unassigned-risk-missing", "Unassigned work is omitted from the risk summary", "The release bundle contains unassigned remediation tasks but does not list them in its additional risk assessment.");
      }
      if (actualOverdueBlockers && !additionalRisks.some((risk) => /overdue rollout-blocking remediation task\(s\) require escalation/i.test(risk))) {
        add("warning", "work-queue-escalation-risk-missing", "Overdue rollout blockers are omitted from the risk summary", "The release bundle contains overdue blockers but does not include an escalation summary in its additional risks.");
      }
      if (nonNegativeInteger(bundleQueue.resolvedOpenBlockerCount) && bundleQueue.resolvedOpenBlockerCount > 0
        && !additionalRisks.some((risk) => /queue task\(s\) have been marked resolved while the underlying error finding remains open/i.test(risk))) {
        add("warning", "work-queue-resolved-open-blocker-risk-missing", "Resolved task status obscures an open canonical blocker", "The release bundle contains task-level completions while the underlying error finding remains open, but the additional risks do not explain that task completion does not clear the rollout blocker.");
      }
      if (handoffSummary && nonNegativeInteger(handoffSummary.resolvedTasksWithOpenFindings?.count) && handoffSummary.resolvedTasksWithOpenFindings.count > 0
        && !additionalRisks.some((risk) => /resolved queue task\(s\).*underlying open findings|queue task\(s\) have been marked resolved while the underlying error finding remains open/i.test(risk))) {
        add("warning", "work-queue-handoff-open-findings-risk-missing", "Handoff summary open findings are omitted from risks", "The handoff summary includes queue tasks marked resolved while their underlying findings remain open, but the risk assessment does not disclose the remaining review work.");
      }
    }
  }
  if (Object.hasOwn(record, "reviewFindings")) {
    if (!Array.isArray(record.reviewFindings)) {
      add("error", "review-findings-type", "Tracked review findings are not an array", "decisionRecord.reviewFindings must be an array when present.");
    } else {
      const seenFindingIds = new Set();
      for (const [index, finding] of record.reviewFindings.entries()) {
        if (!isRecord(finding)) {
          add("warning", `review-finding-row-${index}`, "A tracked review finding is malformed", `Finding row ${index + 1} is not an object.`);
          continue;
        }
        const label = boundedText(finding.title || finding.code || `Finding ${index + 1}`, 160);
        if (Object.hasOwn(finding, "sourceDriftReviews") && !Array.isArray(finding.sourceDriftReviews)) {
          add("warning", `review-finding-source-drift-reviews-type-${index}`, `Source drift review history is malformed: ${label}`, "sourceDriftReviews should be an array. A malformed saved resolution history cannot waive current source drift.");
        }
        if (!boundedText(finding.id, 120)) add("warning", `review-finding-id-${index}`, "A tracked review finding has no ID", `${label} cannot be reliably reconciled across repeat imports without an ID.`);
        else if (seenFindingIds.has(finding.id)) add("warning", `review-finding-duplicate-id-${index}`, "Tracked review finding IDs are duplicated", `Finding ID '${boundedText(finding.id, 120)}' appears more than once.`);
        else seenFindingIds.add(finding.id);
        if (!["error", "warning", "info"].includes(finding.severity)) add("warning", `review-finding-severity-${index}`, "A tracked finding has an unknown severity", `${label} has severity '${boundedText(finding.severity || "missing", 40)}'.`);
        if (!["open", "accepted-risk", "resolved"].includes(finding.status)) add("warning", `review-finding-status-${index}`, "A tracked finding has an unknown disposition", `${label} has status '${boundedText(finding.status || "missing", 40)}'.`);
        if (finding.status === "open") {
          const blockerText = finding.severity === "error" ? " This error-severity finding blocks rollout readiness." : " This finding remains outstanding for review.";
          add("warning", `tracked-review-finding-open-${index}`, `Tracked finding remains open: ${label}`, `${boundedText(finding.detail || finding.code, 700)}${blockerText}`);
        }
        if (isRecord(finding.reoccurrence) && finding.reoccurrence.state === "unreviewed") {
          const blockerText = finding.severity === "error" ? " This recurring error-severity finding blocks rollout readiness until the reviewer explicitly reopens it." : " The reviewer must inspect this reoccurrence and explicitly reopen the finding if it is active.";
          add("warning", `tracked-review-finding-reoccurrence-${index}`, `Previously closed finding reappeared: ${label}`, `Previously ${boundedText(finding.reoccurrence.previousStatus || finding.status, 40)}; detected in ${boundedText(finding.reoccurrence.sourceBundleName || "a later release bundle", 180)}.${blockerText}`);
        }
        if (["accepted-risk", "resolved"].includes(finding.status)
          && (!boundedText(finding.owner, 120) || !boundedText(finding.rationale, 1600) || !boundedText(finding.evidence, 1200))) {
          add("warning", `review-finding-attestation-${index}`, `Finding disposition lacks documentation: ${label}`, "Accepted Risk and Resolved findings should preserve an owner, rationale, and supporting evidence/reference.");
        }
        const acceptanceCriteria = isRecord(finding.acceptanceCriteria) ? finding.acceptanceCriteria : {};
        const normalizedCriteria = normalizeRemediationAcceptanceCriteria(acceptanceCriteria);
        const criteriaAreMalformed = Object.keys(normalizedCriteria).length !== Object.keys(acceptanceCriteria).length
          || Object.entries(normalizedCriteria).some(([key, target]) => typeof acceptanceCriteria[key] !== "number" || acceptanceCriteria[key] !== target);
        if (criteriaAreMalformed) {
          add("warning", `review-finding-acceptance-criteria-${index}`, `Quantitative acceptance criteria are malformed: ${label}`, "Targets should use recognized metric keys and numeric values in valid ranges. Unsupported or invalid targets cannot be evaluated.");
        }
        const verificationRuns = Array.isArray(finding.verificationRuns) ? finding.verificationRuns : [];
        if (Object.hasOwn(finding, "verificationRuns") && !Array.isArray(finding.verificationRuns)) {
          add("warning", `review-finding-verification-runs-type-${index}`, `Verification runs are malformed: ${label}`, "verificationRuns should be an array of documented before/after verification observations.");
        }
        const driftReviews = Array.isArray(finding.sourceDriftReviews) ? finding.sourceDriftReviews : [];
        const runIdsForDriftReviews = new Set(verificationRuns.filter(isRecord).map((run) => boundedText(run.id, 140)));
        for (const [driftReviewIndex, driftReview] of driftReviews.entries()) {
          if (!isRecord(driftReview) || !boundedText(driftReview.id, 140) || !boundedText(driftReview.fingerprint, 40)
            || !boundedText(driftReview.reviewer, 120) || !boundedText(driftReview.rationale, 1200)
            || !["acceptable-context", "requires-reverification"].includes(driftReview.disposition)) {
            add("warning", `review-finding-source-drift-review-malformed-${index}-${driftReviewIndex}`, `Source drift disposition is incomplete: ${label}`, "Each drift review should preserve a reviewer, rationale, known disposition, run ID, and source fingerprint. Malformed reviews cannot waive current source drift.");
          } else if (!runIdsForDriftReviews.has(boundedText(driftReview.runId, 140))) {
            add("warning", `review-finding-source-drift-review-orphan-${index}-${driftReviewIndex}`, `Source drift review references a missing run: ${label}`, `Saved drift disposition '${driftReview.disposition}' references a verification run that is not included in this decision record. Preserve it as history, but do not use it to waive current drift.`);
          }
        }
        for (const [runIndex, run] of verificationRuns.entries()) {
          const runLabel = `${label} run ${runIndex + 1}`;
          if (!isRecord(run)) {
            add("warning", `review-finding-verification-run-${index}-${runIndex}`, `A verification run is malformed: ${runLabel}`, "Each verification run should be an object with an outcome, before/after description, summary, recorder and evidence reference.");
            continue;
          }
          const runCriteria = isRecord(run.acceptanceCriteriaSnapshot) ? run.acceptanceCriteriaSnapshot : {};
          const normalizedRunCriteria = normalizeRemediationAcceptanceCriteria(runCriteria);
          const runCriteriaMalformed = Object.keys(normalizedRunCriteria).length !== Object.keys(runCriteria).length
            || Object.entries(normalizedRunCriteria).some(([key, target]) => typeof runCriteria[key] !== "number" || runCriteria[key] !== target);
          if (runCriteriaMalformed) {
            add("warning", `review-finding-acceptance-snapshot-${index}-${runIndex}`, `Verification criteria snapshot is malformed: ${runLabel}`, "A run must preserve recognized numeric acceptance targets from the time it was recorded.");
          }
          const runMeasurements = normalizeRemediationMeasurements(run.measurements);
          if (Object.hasOwn(run, "measurements")) {
            const rawMeasurements = isRecord(run.measurements) ? run.measurements : null;
            const validMeasurementShape = rawMeasurements && Object.entries(rawMeasurements).every(([metricKey, pair]) => {
              const normalizedPair = runMeasurements[metricKey];
              if (!normalizedPair || !isRecord(pair)) return false;
              return ["before", "after"].every((field) => pair[field] === null || pair[field] === undefined
                || (typeof pair[field] === "number" && Number.isFinite(pair[field]) && normalizedPair[field] === pair[field]));
            });
            if (!validMeasurementShape) {
              add("warning", `review-finding-measurements-malformed-${index}-${runIndex}`, `Numeric measurements are malformed: ${runLabel}`, "Numeric measurement fields must use recognized metrics and finite numeric values (or null for unavailable values). The review does not treat malformed values as measured results.");
            }
          }
          const expectedAcceptanceEvaluation = evaluateRemediationAcceptanceCriteria(runCriteria, runMeasurements);
          if (Object.keys(runCriteria).length && (!isRecord(run.acceptanceEvaluation)
            || run.acceptanceEvaluation.status !== expectedAcceptanceEvaluation.status
            || run.acceptanceEvaluation.passedCount !== expectedAcceptanceEvaluation.passedCount
            || run.acceptanceEvaluation.failedCount !== expectedAcceptanceEvaluation.failedCount
            || run.acceptanceEvaluation.unevaluatedCount !== expectedAcceptanceEvaluation.unevaluatedCount)) {
            add("warning", `review-finding-acceptance-evaluation-mismatch-${index}-${runIndex}`, `Quantitative acceptance result is inconsistent: ${runLabel}`, "The evaluation status and counts must agree with the recorded numeric measurements and the criteria snapshot. The review recomputes this result instead of trusting the stored summary.");
          }
          const includedLoadTestRecords = safeArray(inventory?.loadTests?.records);
          const sourceEvaluation = evaluateRemediationMeasurementSources(runMeasurements, run.measurementSources, { loadTestRecords: includedLoadTestRecords });
          const driftEvaluation = evaluateRemediationMeasurementSourceDrift(run.measurementSources, includedLoadTestRecords);
          const sourceDriftReviews = safeArray(finding.sourceDriftReviews);
          const acceptedContextItemKeys = new Set();
          for (const [reviewIndex, driftReview] of sourceDriftReviews.entries()) {
            if (!isRecord(driftReview) || driftReview.runId !== run.id) continue;
            const currentItem = driftEvaluation.items.find((item) => item.metricKey === driftReview.metricKey
              && item.side === driftReview.side && item.sourceRecordId === driftReview.sourceRecordId);
            if (currentItem?.state === "unchanged") continue;
            const fingerprint = currentItem ? fingerprintRemediationSourceDriftItem(currentItem) : "";
            if (!currentItem || fingerprint !== driftReview.fingerprint) {
              add("warning", `review-finding-source-drift-review-stale-${index}-${runIndex}-${reviewIndex}`, `Source drift review no longer matches current evidence: ${runLabel}`, `The saved reviewer disposition for ${boundedText(driftReview.metricLabel, 120)} ${boundedText(driftReview.side, 20)} no longer matches the current source fingerprint. Re-review the current difference; previous reviewer rationale is retained as history.`);
              continue;
            }
            if (driftReview.disposition === "acceptable-context") {
              if (!canAcceptRemediationSourceDriftAsContext(currentItem)) {
                add("error", `review-finding-source-drift-review-invalid-${index}-${runIndex}-${reviewIndex}`, `Invalid acceptable-context source drift disposition: ${runLabel}`, "Only a display-name-only metadata change may be recorded as acceptable context. Value, field-definition, workload, missing-source, and incomplete-snapshot changes require a new verification run.");
              } else {
                acceptedContextItemKeys.add(`${currentItem.metricKey}:${currentItem.side}:${currentItem.sourceRecordId}:${fingerprint}`);
              }
            }
          }
          if (["drift-detected", "snapshot-incomplete"].includes(driftEvaluation.status)) {
            for (const [driftIndex, driftRow] of driftEvaluation.items.entries()) {
              const itemKey = `${driftRow.metricKey}:${driftRow.side}:${driftRow.sourceRecordId}:${fingerprintRemediationSourceDriftItem(driftRow)}`;
              const acceptedNameOnlyContext = acceptedContextItemKeys.has(itemKey);
              if (acceptedNameOnlyContext) {
                add("info", `review-finding-source-drift-reviewed-context-${index}-${runIndex}-${driftIndex}`, `${driftRow.metricLabel} ${driftRow.side} source change reviewed as non-material context`, "A reviewer documented a display-name-only change. Original and current snapshots remain preserved; the acceptance does not waive any other changed or missing evidence.");
              }
              for (const [changeIndex, change] of driftRow.changes.entries()) {
                if (acceptedNameOnlyContext && change.type === "metadata-changed" && Array.isArray(change.fields) && change.fields.every((field) => field === "name")) continue;
                const isHardMismatch = ["source-record-missing", "value-changed", "field-definition-changed"].includes(change.type);
                const severity = isHardMismatch ? "error" : "warning";
                add(severity, `review-finding-source-drift-${index}-${runIndex}-${driftIndex}-${changeIndex}`, `${driftRow.metricLabel} ${driftRow.side} source drift: ${change.label}`, `${change.detail} The original verification snapshot is preserved; a new verification run is required before relying on the previous reviewer confirmation. Run: ${runLabel}.`);
              }
            }
          }
          if (sourceEvaluation.measurementCount > 0 && sourceEvaluation.status !== "complete") {
            const severity = sourceEvaluation.status === "inconsistent" ? "error" : "warning";
            add(severity, `review-finding-measurement-source-summary-${index}-${runIndex}`, `Measurement source traceability is ${sourceEvaluation.status}: ${runLabel}`, `${sourceEvaluation.reason} The reviewer recomputes source mapping consistency; linked fields and references are not independently authenticated.`);
          }
          if (isRecord(run.measurementSourceEvaluation) && (
            run.measurementSourceEvaluation.status !== sourceEvaluation.status
            || run.measurementSourceEvaluation.linkedCount !== sourceEvaluation.linkedCount
            || run.measurementSourceEvaluation.unlinkedCount !== sourceEvaluation.unlinkedCount
            || run.measurementSourceEvaluation.incompleteCount !== sourceEvaluation.incompleteCount
            || run.measurementSourceEvaluation.mismatchCount !== sourceEvaluation.mismatchCount
          )) {
            add("warning", `review-finding-measurement-source-evaluation-mismatch-${index}-${runIndex}`, `Stored source-mapping summary differs from recalculation: ${runLabel}`, "The bundle's stored source-mapping status or counts do not match the result recomputed from numeric measurements, source snapshots and included load-test records.");
          }
          for (const [sourceIndex, sourceRow] of sourceEvaluation.items.entries()) {
            if (!["mismatch", "source-changed", "source-not-included", "unlinked", "incomplete", "orphaned"].includes(sourceRow.state)) continue;
            if (sourceRow.state === "not-applicable") continue;
            const isMismatch = ["mismatch", "source-changed", "orphaned"].includes(sourceRow.state);
            const metricLabel = `${sourceRow.metricLabel} ${sourceRow.side}`;
            add(isMismatch ? "error" : "warning", `review-finding-measurement-source-${index}-${runIndex}-${sourceIndex}`, `${metricLabel} source mapping: ${sourceRow.state}`, `${sourceRow.detail} Run: ${runLabel}.`);
          }
          if (Object.keys(runCriteria).length && run.outcome === "pass" && expectedAcceptanceEvaluation.status !== "pass") {
            add(expectedAcceptanceEvaluation.status === "fail" ? "error" : "warning", `review-finding-acceptance-not-met-${index}-${runIndex}`, `Verification run does not meet quantitative acceptance criteria: ${runLabel}`, `The submitted run outcome is Pass, but numeric acceptance evaluation is ${expectedAcceptanceEvaluation.status}: ${expectedAcceptanceEvaluation.reason}`);
          }
          if (!["pass", "fail", "inconclusive"].includes(run.outcome)
            || !boundedText(run.beforeState, 1000) || !boundedText(run.afterState, 1000)
            || !boundedText(run.summary, 1600) || !boundedText(run.recordedBy, 120)
            || !boundedText(run.evidence, 1200) || !boundedText(run.recordedAt, 80)) {
            add("warning", `review-finding-verification-run-incomplete-${index}-${runIndex}`, `Verification run is incomplete: ${runLabel}`, "The run should include a recognized outcome, before/after state, summary, recorder, timestamp and evidence reference.");
          }
        }
        const remediationVerification = isRecord(finding.remediationVerification) ? finding.remediationVerification : {};
        if (finding.status === "resolved" && remediationVerification.status !== "verified") {
          add("warning", `resolved-finding-effectiveness-unverified-${index}`, `Finding is Resolved but effectiveness is not verified: ${label}`, verificationRuns.length
            ? `The latest submitted verification result is ${boundedText(verificationRuns.at(-1)?.outcome || "unavailable", 40)}. A passing run requires explicit reviewer confirmation; submitted evidence alone does not prove remediation worked.`
            : "A Resolved disposition and evidence reference are not a verification run. Record before/after results, then explicitly confirm a passing run.");
        }
        if (remediationVerification.status === "verified") {
          const verifiedRun = verificationRuns.find((run) => run?.id === remediationVerification.runId);
          const latestRun = verificationRuns.at(-1);
          const latestAcceptance = latestRun && isRecord(latestRun.acceptanceCriteriaSnapshot)
            ? evaluateRemediationAcceptanceCriteria(latestRun.acceptanceCriteriaSnapshot, latestRun.measurements)
            : { status: "not-configured" };
          const criteriaMatch = acceptanceCriteriaEqual(finding.acceptanceCriteria, latestRun?.acceptanceCriteriaSnapshot);
          if (!verifiedRun || verifiedRun.id !== latestRun?.id || verifiedRun.outcome !== "pass"
            || !boundedText(remediationVerification.verifiedBy, 120) || !boundedText(remediationVerification.rationale, 1200)
            || !boundedText(remediationVerification.verifiedAt, 80) || verifiedRun.verificationSupersededAt
            || !criteriaMatch || (Object.keys(normalizeRemediationAcceptanceCriteria(finding.acceptanceCriteria)).length > 0 && latestAcceptance.status !== "pass")) {
            add("warning", `remediation-verification-inconsistent-${index}`, `Remediation verification is internally inconsistent: ${label}`, "The current verification must reference the latest passing run, satisfy the current quantitative acceptance targets when configured, and preserve reviewer, timestamp, rationale, and non-superseded run metadata.");
          }
          add("info", `remediation-verification-manual-${index}`, `Remediation verification is a reviewer attestation: ${label}`, "The bundle can validate that the verification fields agree, but it cannot independently authenticate the run, measurements, or reviewer identity.");
        }
        if (finding.independentlyVerified !== false) add("warning", `review-finding-verification-${index}`, `Finding claims unsupported verification: ${label}`, "A tracked reviewer disposition is a manual record; this reviewer cannot authenticate the cited evidence.");
        if (!Array.isArray(finding.auditTrail)) add("warning", `review-finding-audit-${index}`, `Finding audit history is missing: ${label}`, "The tracked finding should preserve an auditTrail array to show disposition and remediation changes.");
      }
    }
  }

  if (isRecord(readiness)) {
    if (!Array.isArray(readiness.checks)) add("error", "readiness-checks-type", "Readiness checks are missing", "readiness.checks must be an array.");
    if (!nonNegativeInteger(readiness.completeCount) || !nonNegativeInteger(readiness.totalCount) || !nonNegativeInteger(readiness.outstandingCount)) {
      add("error", "readiness-count-types", "Readiness counts are invalid", "Readiness counts must be non-negative integers.");
    } else {
      const checks = safeArray(readiness.checks);
      const derivedComplete = checks.filter((check) => check?.state === "complete").length;
      const derivedOutstanding = checks.length - derivedComplete;
      if (readiness.totalCount !== checks.length || readiness.completeCount !== derivedComplete || readiness.outstandingCount !== derivedOutstanding || readiness.completeCount + readiness.outstandingCount !== readiness.totalCount) {
        add("warning", "readiness-count-mismatch", "Readiness counts do not match the checklist", `Summary reports ${readiness.completeCount}/${readiness.totalCount} complete and ${readiness.outstandingCount} outstanding, but ${checks.length} checklist row(s) indicate ${derivedComplete} complete and ${derivedOutstanding} outstanding.`);
      }
    }
    const expectedDisposition = readiness.status === "review-required"
      ? "ready-for-human-review"
      : readiness.status === "blocked"
        ? "blocked"
        : readiness.status === "not-ready"
          ? "not-ready-for-human-review"
          : null;
    if (!expectedDisposition) add("error", "readiness-status", "Unknown readiness status", `Readiness status '${boundedText(readiness.status || "missing", 80)}' is not supported by this bundle schema.`);
    else if (bundle.disposition !== expectedDisposition) add("warning", "disposition-mismatch", "Bundle disposition conflicts with readiness", `Readiness '${readiness.status}' maps to disposition '${expectedDisposition}', but the bundle says '${boundedText(bundle.disposition || "missing", 80)}'.`);
    const incomplete = safeArray(readiness.checks).filter((check) => check?.state !== "complete");
    if (incomplete.length) {
      add("warning", "readiness-open-checks", `${incomplete.length} readiness check(s) remain open`, incomplete.slice(0, 6).map((check) => boundedText(check?.label || check?.id || "Unnamed check", 240)).join("; ") + (incomplete.length > 6 ? "; additional checks omitted from this summary" : ""));
    }
  }

  if (isRecord(inventory)) {
    const simulation = inventory.simulationComparison;
    if (!isRecord(simulation)) add("error", "simulation-inventory-missing", "Simulation comparison is missing", "evidenceInventory.simulationComparison must be an object.");
    else {
      if (!Array.isArray(simulation.metrics)) add("error", "simulation-metrics-type", "Simulation metric list is invalid", "simulationComparison.metrics must be an array.");
      if (simulation.status === "comparable" && safeArray(simulation.metrics).length === 0) add("warning", "comparable-without-metrics", "Comparable simulation has no metrics", "The comparison is marked comparable but includes no metric rows.");
      if (isRecord(report)) {
        if (report.simulationStatus !== simulation.status) add("warning", "simulation-status-mismatch", "Simulation status differs from the saved report", `Report snapshot says '${boundedText(report.simulationStatus || "missing", 80)}', but the inventory says '${boundedText(simulation.status || "missing", 80)}'.`);
        const sourceMetrics = safeArray(report.metrics).slice(0, 12);
        const inventoryMetrics = safeArray(simulation.metrics);
        if (sourceMetrics.length !== inventoryMetrics.length) add("warning", "simulation-metric-count-mismatch", "Simulation metric inventory differs from the report snapshot", `The report snapshot has ${sourceMetrics.length} metric row(s) in the exportable range, but the inventory has ${inventoryMetrics.length}.`);
        for (const [index, exportedMetric] of inventoryMetrics.entries()) {
          const sourceMetric = sourceMetrics[index];
          if (!sourceMetric) break;
          const same = exportedMetric?.key === sourceMetric.key
            && exportedMetric?.label === (sourceMetric.label || sourceMetric.key)
            && exportedMetric?.baseline === (typeof sourceMetric.before === "number" && Number.isFinite(sourceMetric.before) ? sourceMetric.before : null)
            && exportedMetric?.proposed === (typeof sourceMetric.after === "number" && Number.isFinite(sourceMetric.after) ? sourceMetric.after : null)
            && exportedMetric?.delta === (typeof sourceMetric.delta === "number" && Number.isFinite(sourceMetric.delta) ? sourceMetric.delta : null)
            && exportedMetric?.direction === (sourceMetric.direction || "");
          if (!same) add("warning", `simulation-snapshot-${index}`, "A simulation inventory row differs from its saved report", `Metric row ${index + 1} does not match the same-position row in decisionRecord.reportSnapshot.metrics.`);
        }
      }
      for (const [index, metric] of safeArray(simulation.metrics).entries()) {
        if (!isRecord(metric)) {
          add("warning", `metric-shape-${index}`, "A simulation metric row is malformed", `Metric row ${index + 1} is not an object.`);
          continue;
        }
        const numericFields = ["baseline", "proposed", "delta"];
        if (numericFields.some((key) => !finiteOrNull(metric[key]))) {
          add("warning", `metric-number-${index}`, "A simulation metric contains an invalid number", `Metric '${boundedText(metric.label || metric.key || `row ${index + 1}`, 120)}' contains a non-finite or non-numeric baseline, proposed value, or delta.`);
          continue;
        }
        if (typeof metric.baseline === "number" && typeof metric.proposed === "number" && typeof metric.delta === "number") {
          const expected = metric.proposed - metric.baseline;
          const tolerance = Math.max(0.0001, Math.abs(expected) * 0.000001);
          if (Math.abs(metric.delta - expected) > tolerance) {
            add("warning", `metric-delta-${index}`, "A simulation delta is inconsistent", `Metric '${boundedText(metric.label || metric.key || `row ${index + 1}`, 120)}' records Δ ${metric.delta}, but proposed − baseline is ${expected}.`);
          }
        }
      }
    }

    const loadTests = inventory.loadTests;
    if (!isRecord(loadTests)) add("error", "load-tests-missing", "Load-test inventory is missing", "evidenceInventory.loadTests must be an object.");
    else {
      const records = loadTests.records;
      if (!Array.isArray(records)) add("error", "load-tests-records-type", "Load-test records are invalid", "loadTests.records must be an array.");
      const includedLength = safeArray(records).length;
      if (!nonNegativeInteger(loadTests.recordCountAtExport) || !nonNegativeInteger(loadTests.reportSnapshotRecordCount) || !nonNegativeInteger(loadTests.includedRecordCount)) {
        add("error", "load-test-count-types", "Load-test record counts are invalid", "Load-test counts must be non-negative integers.");
      } else {
        if (loadTests.includedRecordCount !== includedLength) add("warning", "load-test-included-count", "Included load-test count does not match its records", `The summary says ${loadTests.includedRecordCount} included, while ${includedLength} record(s) are present.`);
        if (loadTests.includedRecordCount > loadTests.recordCountAtExport) add("warning", "load-test-count-overflow", "More load-test records are included than recorded at export", "The included count cannot exceed the record count at export.");
        if (loadTests.recordCountAtExport > loadTests.includedRecordCount) add("warning", "load-test-truncated", "Some load-test records are not included", `${loadTests.recordCountAtExport - loadTests.includedRecordCount} record(s) are absent from this bundle. The exporter may cap the included set; verify whether omitted records are relevant to the decision.`);
        const reportCount = isRecord(report) && nonNegativeInteger(report.loadTestRecordsCount) ? report.loadTestRecordsCount : null;
        if (reportCount !== null && reportCount !== loadTests.reportSnapshotRecordCount) add("warning", "load-test-snapshot-count", "Load-test count differs from the decision snapshot", `The decision snapshot records ${reportCount}, but the bundle summary records ${loadTests.reportSnapshotRecordCount}.`);
        const countsMatch = loadTests.reportSnapshotRecordCount === loadTests.recordCountAtExport;
        if (loadTests.recordCountsMatch !== countsMatch) add("warning", "load-test-match-flag", "Load-test count-match flag is inconsistent", `The recorded counts imply recordCountsMatch=${countsMatch}, but the bundle says '${String(loadTests.recordCountsMatch)}'.`);
      }
      for (const [index, testRecord] of safeArray(records).entries()) {
        if (!isRecord(testRecord)) {
          add("warning", `load-test-row-${index}`, "A load-test record is malformed", `Load-test record ${index + 1} is not an object.`);
          continue;
        }
        if (testRecord.independentlyVerified !== false || testRecord.evidenceClassification !== "user-supplied-measurement") {
          add("warning", `load-test-classification-${index}`, "A load-test record uses an unexpected evidence classification", `Load-test record '${boundedText(testRecord.name || testRecord.id || `#${index + 1}`, 120)}' should remain labeled as a user-supplied measurement that is not independently verified.`);
        }
      }
    }

    if (isRecord(report) && isRecord(inventory.architectureChanges)) {
      if (report.changeStatus !== inventory.architectureChanges.changeStatus || report.changeCount !== inventory.architectureChanges.changeCount) {
        add("warning", "architecture-summary-mismatch", "Architecture change summary differs from the report snapshot", "The change status/count in the evidence inventory does not match the saved decision report.");
      }
      const reportChanges = safeArray(report.changes).slice(0, 30);
      const inventoryChanges = safeArray(inventory.architectureChanges.changes);
      if (reportChanges.length !== inventoryChanges.length) add("warning", "architecture-change-count-mismatch", "Architecture change rows differ from the report snapshot", `The snapshot export contains ${reportChanges.length} change row(s), but the inventory has ${inventoryChanges.length}.`);
    } else if (!isRecord(inventory.architectureChanges)) {
      add("error", "architecture-changes-missing", "Architecture change inventory is missing", "evidenceInventory.architectureChanges must be an object.");
    }

    const gates = inventory.decisionValidationGates;
    if (!Array.isArray(gates)) add("error", "gates-type", "Decision validation gates are invalid", "decisionValidationGates must be an array.");
    else {
      const open = gates.filter((gate) => gate?.done !== true);
      if (open.length) add("warning", "gates-open", `${open.length} decision validation gate(s) remain open`, open.slice(0, 6).map((gate) => boundedText(gate?.label || gate?.id || "Unnamed gate", 240)).join("; ") + (open.length > 6 ? "; additional gates omitted from this summary" : ""));
      for (const [index, gate] of gates.entries()) {
        if (!isRecord(gate) || typeof gate.done !== "boolean" || (gate.done && gate.state !== "recorded-complete") || (!gate.done && gate.state !== "outstanding")) {
          add("warning", `gate-state-${index}`, "A validation gate has inconsistent state fields", `Gate row ${index + 1} has conflicting or missing done/state values.`);
        }
      }
    }

    const rolloutChecks = inventory.rolloutChecks;
    if (!Array.isArray(rolloutChecks)) add("error", "rollout-checks-type", "Rollout checks are invalid", "rolloutChecks must be an array.");
    else {
      const open = rolloutChecks.filter((check) => check?.state !== "complete");
      if (open.length) add("warning", "rollout-checks-open", `${open.length} rollout check(s) remain incomplete`, open.slice(0, 5).map((check) => boundedText(check?.label || check?.id || "Unnamed rollout check", 240)).join("; ") + (open.length > 5 ? "; additional checks omitted from this summary" : ""));
      for (const [index, check] of rolloutChecks.entries()) {
        if (!isRecord(check)) {
          add("warning", `rollout-check-row-${index}`, "A rollout check is malformed", `Rollout check ${index + 1} is not an object.`);
          continue;
        }
        const hasEvidence = Boolean(boundedText(check.evidenceReference, 600));
        if (check.state === "complete" && (!check.checkedByRecordOwner || !hasEvidence)) {
          add("warning", `rollout-check-evidence-${index}`, "A completed rollout check lacks recorded evidence", `Rollout check '${boundedText(check.label || check.id, 160)}' is marked complete without both an owner-recorded completion and an evidence reference.`);
        }
        if (check.evidenceReferenceVerified !== false || check.independentlyVerified === true) {
          add("warning", `rollout-check-verification-${index}`, "A rollout evidence reference claims verification", `Reference for '${boundedText(check.label || check.id, 160)}' cannot be authenticated by this schema-only review.`);
        }
      }
    }
  }

  if (isRecord(riskAssessment)) {
    if (riskAssessment.finalHumanApprovalRequired !== true) add("error", "human-approval-guardrail", "Final human approval guardrail is missing", "The bundle must preserve finalHumanApprovalRequired=true; evidence review does not authorize deployment.");
    const riskLists = [
      ["Reported risk", riskAssessment.reportedRisks],
      ["Additional risk", riskAssessment.additionalRisks],
    ];
    for (const [label, list] of riskLists) {
      if (!Array.isArray(list)) add("warning", `risk-list-${label.toLowerCase().replace(/\s/g, "-")}`, `${label}s are not listed as an array`, `${label} entries should be an array, including an empty array when none are recorded.`);
    }
    for (const [key, label] of [["outstandingReadinessChecks", "readiness"], ["outstandingDecisionGates", "decision-gate"], ["outstandingRolloutChecks", "rollout"]]) {
      if (!Array.isArray(riskAssessment[key])) add("warning", `risk-open-list-${key}`, `Outstanding ${label} list is missing`, `riskAssessment.${key} should preserve the entries still requiring review.`);
    }
  }

  add("info", "authenticity-unverified", "Authenticity is not verified", "The file has no trusted signature or external verification proof in this review. A structurally consistent file can still be edited or contain inaccurate user-supplied evidence.");
  const hasErrors = findings.some((finding) => finding.severity === "error");
  const hasWarnings = findings.some((finding) => finding.severity === "warning");
  const status = hasErrors ? "invalid" : hasWarnings ? "review-required" : "consistent";
  return createReview({ status, findings, bundle, sourceName });
}
