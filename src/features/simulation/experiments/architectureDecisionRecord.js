import { buildRolloutReadiness, createDefaultRolloutChecks, normalizeRolloutChecks } from "./rolloutReadiness.js";
import { buildRemediationEffectivenessSummary, normalizeDecisionReviewFindings } from "./reviewFindingTracking.js";
import { evaluateRemediationMeasurementSourceDrift } from "./remediationEvidenceMapping.js";
import { normalizeRemediationWorkQueueTasks } from "./remediationWorkQueueMetadata.js";
import { buildRemediationWorkQueue } from "./remediationWorkQueue.js";
import { normalizeRemediationHandoffNotes } from "./remediationHandoff.js";
const DECISION_STATUSES = new Set(["proposed", "accepted", "rejected", "deferred"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const boundedText = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);
const safeDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString();
const finiteOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

function makeRecordId(createdAt) {
  const stamp = String(createdAt).replace(/[^0-9A-Za-z]/g, "").slice(0, 20) || "unknown";
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `adr-${stamp}-${suffix}`;
}

function snapshotReport(report = {}) {
  const counts = isRecord(report.counts) ? report.counts : {};
  return {
    title: boundedText(report.title || "Architecture Decision Report", 120),
    baselineName: boundedText(report.baselineName || "Unavailable", 160),
    proposedName: boundedText(report.proposedName || "Current architecture", 160),
    recommendation: boundedText(report.decision || "Insufficient evidence", 400),
    sourceRationale: boundedText(report.rationale || "No report rationale was available.", 1600),
    confidence: boundedText(report.confidence || "Unavailable", 160),
    changeStatus: boundedText(report.changeStatus || "unavailable", 40),
    changeCount: Number.isSafeInteger(report.changeCount) ? Math.max(0, report.changeCount) : 0,
    counts: {
      addedComponents: counts.addedComponents || 0,
      removedComponents: counts.removedComponents || 0,
      modifiedComponents: counts.modifiedComponents || 0,
      addedRelationships: counts.addedRelationships || 0,
      removedRelationships: counts.removedRelationships || 0,
      modifiedRelationships: counts.modifiedRelationships || 0,
    },
    simulationStatus: boundedText(report.simulationStatus || "unavailable", 40),
    simulationReason: boundedText(report.simulationReason || "Simulation comparison was unavailable.", 1000),
    metrics: safeArray(report.metrics).slice(0, 12).map((metric) => ({
      key: boundedText(metric?.key || "metric", 80),
      label: boundedText(metric?.label || metric?.key || "Metric", 120),
      before: finiteOrNull(metric?.before),
      after: finiteOrNull(metric?.after),
      delta: finiteOrNull(metric?.delta),
      direction: boundedText(metric?.direction || "unavailable", 40),
    })),
    changes: safeArray(report.changes).slice(0, 30).map((change) => ({
      action: boundedText(change?.action || "Changed", 40),
      subjectType: boundedText(change?.subjectType || "Element", 40),
      label: boundedText(change?.label || change?.subjectId || "Unnamed element", 160),
      detail: boundedText(change?.detail || "", 400),
    })),
    bottlenecks: safeArray(report.bottlenecks).slice(0, 8).map((item) => ({
      label: boundedText(item?.label || item?.entityId || "Component", 120),
      peakUtilization: finiteOrNull(item?.peakUtilization),
      queueWaitP95Ms: finiteOrNull(item?.queueWaitP95Ms),
      maxDropped: finiteOrNull(item?.maxDropped),
      maxFailed: finiteOrNull(item?.maxFailed),
    })),
    traceEvidence: isRecord(report.traceEvidence) ? {
      label: boundedText(report.traceEvidence.label || "Request trace", 120),
      scenarioLabel: boundedText(report.traceEvidence.scenarioLabel || "Unavailable", 120),
      requestOutcome: boundedText(report.traceEvidence.requestOutcome || "unknown", 40),
      durationMs: finiteOrNull(report.traceEvidence.durationMs),
      serviceTimeMs: finiteOrNull(report.traceEvidence.serviceTimeMs),
      queueWaitMs: finiteOrNull(report.traceEvidence.queueWaitMs),
    } : null,
    recommendations: safeArray(report.recommendations).slice(0, 8).map((item) => ({
      label: boundedText(item?.label || "Optimization experiment", 160),
      interventionKind: boundedText(item?.interventionKind || "unknown", 80),
      reason: boundedText(item?.reason || "Review assumptions before running.", 500),
    })),
    portfolio: safeArray(report.portfolio).slice(0, 8).map((trial) => ({
      rank: finiteOrNull(trial?.rank),
      label: boundedText(trial?.label || "Optimization trial", 160),
      interventionKind: boundedText(trial?.interventionKind || "unknown", 80),
      score: finiteOrNull(trial?.score),
      outcome: boundedText(trial?.outcome || "unavailable", 120),
    })),
    risks: safeArray(report.risks).slice(0, 20).map((item) => boundedText(item, 600)),
    nextSteps: safeArray(report.nextSteps).slice(0, 20).map((item) => boundedText(item, 400)),
    limitations: safeArray(report.limitations).slice(0, 12).map((item) => boundedText(item, 600)),
    profileConfirmed: report.profileConfirmed === true,
    loadTestRecordsCount: Number.isSafeInteger(report.loadTestRecordsCount) ? Math.max(0, report.loadTestRecordsCount) : 0,
  };
}

function makeEvent(type, message, at) {
  return { id: `event-${at}-${Math.random().toString(36).slice(2, 7)}`, type, message: boundedText(message, 300), at };
}

/** Create a portable decision record from a point-in-time decision report. */
export function createArchitectureDecisionRecord({ report = {}, owner = "", rationale = "", status = "proposed", validationGates, createdAt = new Date().toISOString(), id } = {}) {
  const normalizedStatus = DECISION_STATUSES.has(status) ? status : "proposed";
  const at = safeDate(createdAt);
  const snapshot = snapshotReport(report);
  const proposedGates = Array.isArray(validationGates) ? validationGates : snapshot.nextSteps;
  const gates = proposedGates.slice(0, 20).map((gate, index) => {
    const raw = isRecord(gate) ? gate : { label: gate };
    return {
      id: boundedText(raw.id || `gate-${index + 1}`, 100),
      label: boundedText(raw.label || `Validation gate ${index + 1}`, 400),
      done: raw.done === true,
      completedAt: raw.done === true ? safeDate(raw.completedAt || at) : null,
    };
  }).filter((gate) => gate.label);
  const recordId = boundedText(id || makeRecordId(at), 120);
  const record = {
    schemaVersion: 1,
    id: recordId,
    title: boundedText(`${snapshot.proposedName} decision`, 180),
    owner: boundedText(owner, 120),
    status: normalizedStatus,
    rationale: boundedText(rationale, 2000),
    baselineName: snapshot.baselineName,
    proposedName: snapshot.proposedName,
    reportSnapshot: snapshot,
    validationGates: gates,
    rolloutChecks: createDefaultRolloutChecks(),
    reviewFindings: [],
    workQueueTasks: [],
    handoffNotes: [],
    createdAt: at,
    updatedAt: at,
    auditTrail: [],
  };
  record.auditTrail.push(makeEvent("created", `Decision record created with status ${normalizedStatus}.`, at));
  return record;
}

/** Update only editable decision fields; report evidence remains a point-in-time snapshot. */
export function updateArchitectureDecisionRecord(record, patch = {}, { updatedAt = new Date().toISOString() } = {}) {
  if (!isRecord(record) || record.schemaVersion !== 1 || typeof record.id !== "string") {
    throw new TypeError("A valid architecture decision record is required.");
  }
  if (!isRecord(patch)) throw new TypeError("Decision record updates must be an object.");
  const next = structuredClone(record);
  const at = safeDate(updatedAt);
  const events = [];
  if (Object.hasOwn(patch, "status")) {
    if (!DECISION_STATUSES.has(patch.status)) throw new TypeError(`Unsupported decision status: ${String(patch.status)}.`);
    if (patch.status !== next.status) {
      events.push(makeEvent("status-changed", `Status changed from ${next.status} to ${patch.status}.`, at));
      next.status = patch.status;
    }
  }
  if (Object.hasOwn(patch, "owner")) {
    const owner = boundedText(patch.owner, 120);
    if (owner !== next.owner) {
      events.push(makeEvent("owner-updated", owner ? `Owner set to ${owner}.` : "Owner cleared.", at));
      next.owner = owner;
    }
  }
  if (Object.hasOwn(patch, "rationale")) {
    const rationale = boundedText(patch.rationale, 2000);
    if (rationale !== next.rationale) {
      events.push(makeEvent("rationale-updated", rationale ? "Decision rationale updated." : "Decision rationale cleared.", at));
      next.rationale = rationale;
    }
  }
  if (Object.hasOwn(patch, "title")) {
    const title = boundedText(patch.title, 180);
    if (title && title !== next.title) {
      events.push(makeEvent("title-updated", "Decision record title updated.", at));
      next.title = title;
    }
  }
  if (Object.hasOwn(patch, "validationGates")) {
    if (!Array.isArray(patch.validationGates)) throw new TypeError("Validation gates must be an array.");
    const currentById = new Map(safeArray(next.validationGates).map((gate) => [gate.id, gate]));
    const gates = patch.validationGates.slice(0, 20).map((gate, index) => {
      if (!isRecord(gate)) throw new TypeError("Each validation gate must be an object.");
      const gateId = boundedText(gate.id || `gate-${index + 1}`, 100);
      const label = boundedText(gate.label, 400);
      if (!label) throw new TypeError("Validation gate labels cannot be empty.");
      const prior = currentById.get(gateId);
      const done = gate.done === true;
      const completedAt = done ? (prior?.done ? prior.completedAt : at) : null;
      if (!prior || prior.done !== done || prior.label !== label) {
        events.push(makeEvent("validation-gate-updated", `${label}: ${done ? "completed" : "open"}.`, at));
      }
      return { id: gateId, label, done, completedAt };
    });
    next.validationGates = gates;
  }
  if (Object.hasOwn(patch, "rolloutChecks")) {
    if (!Array.isArray(patch.rolloutChecks)) throw new TypeError("Rollout checks must be an array.");
    const current = normalizeRolloutChecks(next.rolloutChecks);
    const patchById = new Map(patch.rolloutChecks.filter(isRecord).map((check) => [check.id, check]));
    const normalized = normalizeRolloutChecks(current.map((check) => {
      const update = patchById.get(check.id);
      if (!update) return check;
      const evidence = boundedText(update.evidence ?? check.evidence, 600);
      const done = update.done === true;
      const completedAt = done && evidence
        ? (check.done && check.evidence && check.completedAt ? check.completedAt : at)
        : null;
      if (check.done !== done || check.evidence !== evidence || check.completedAt !== completedAt) {
        const completion = done && evidence;
        events.push(makeEvent("rollout-check-updated", `${check.label}: ${completion ? "completed with evidence" : done ? "marked complete but evidence is missing" : evidence ? "evidence updated; check remains open" : "reopened"}.`, at));
      }
      return { ...check, done, evidence, completedAt };
    }));
    next.rolloutChecks = normalized;
  }
  if (Object.hasOwn(patch, "workQueueTasks")) {
    if (!Array.isArray(patch.workQueueTasks)) throw new TypeError("Remediation work queue task metadata must be an array.");
    const currentTasks = normalizeRemediationWorkQueueTasks(next.workQueueTasks);
    const incomingTasks = normalizeRemediationWorkQueueTasks(patch.workQueueTasks);
    if (JSON.stringify(currentTasks) !== JSON.stringify(incomingTasks)) {
      const currentById = new Map(currentTasks.map((task) => [task.taskId, task]));
      const changedCount = incomingTasks.filter((task) => JSON.stringify(currentById.get(task.taskId) || null) !== JSON.stringify(task)).length;
      events.push(makeEvent("work-queue-task-metadata-updated", `Remediation task workflow metadata saved for ${changedCount} task(s). Assignment, escalation acknowledgement, follow-up notes, and task resolution remain separate from finding disposition and original evidence.`, at));
      next.workQueueTasks = incomingTasks;
    }
  }
  if (Object.hasOwn(patch, "handoffNotes")) {
    if (!Array.isArray(patch.handoffNotes)) throw new TypeError("Escalation handoff notes must be an array.");
    const currentNotes = normalizeRemediationHandoffNotes(next.handoffNotes);
    const incomingNotes = normalizeRemediationHandoffNotes(patch.handoffNotes);
    if (JSON.stringify(currentNotes) !== JSON.stringify(incomingNotes)) {
      const currentIds = new Set(currentNotes.map((entry) => entry.id));
      const addedCount = incomingNotes.filter((entry) => !currentIds.has(entry.id)).length;
      events.push(makeEvent("escalation-handoff-note-added", `Escalation handoff notes saved (${addedCount} new note(s)). Queue summaries remain point-in-time context and do not alter decision evidence.`, at));
      next.handoffNotes = incomingNotes;
    }
  }
  if (Object.hasOwn(patch, "reviewFindings")) {
    if (!Array.isArray(patch.reviewFindings)) throw new TypeError("Review findings must be an array.");
    for (const finding of patch.reviewFindings) {
      if (!isRecord(finding)) throw new TypeError("Each review finding must be an object.");
      if (finding.status !== undefined && !["open", "accepted-risk", "resolved"].includes(finding.status)) {
        throw new TypeError(`Unsupported review finding status: ${String(finding.status)}.`);
      }
      if (finding.status !== undefined && finding.status !== "open"
        && (!boundedText(finding.owner, 120) || !boundedText(finding.rationale, 1600) || !boundedText(finding.evidence, 1200))) {
        throw new TypeError("Accepted Risk and Resolved findings require an owner, rationale, and supporting evidence.");
      }
    }
    const currentFindings = normalizeDecisionReviewFindings(next.reviewFindings);
    const incomingFindings = normalizeDecisionReviewFindings(patch.reviewFindings);
    const beforeById = new Map(currentFindings.map((finding) => [finding.id, finding]));
    const afterById = new Map(incomingFindings.map((finding) => [finding.id, finding]));
    for (const finding of incomingFindings) {
      const prior = beforeById.get(finding.id);
      if (prior?.freshEvidenceRequired && finding.status !== "open"
        && (finding.freshEvidenceRequired || !finding.freshEvidenceAt || !finding.evidence || finding.evidence === prior.previousEvidence)) {
        throw new Error("A reopened finding requires fresh supporting evidence, different from its previous evidence, before it can be marked Resolved or Accepted Risk.");
      }
      if (!prior) {
        events.push(makeEvent("review-finding-tracked", `Review finding tracked: ${finding.title} (${finding.severity}, ${finding.status}).`, at));
        continue;
      }
      const changedFields = ["status", "owner", "rationale", "evidence", "detail", "severity", "title"]
        .filter((key) => prior[key] !== finding[key]);
      const reoccurrenceChanged = JSON.stringify(prior.reoccurrence) !== JSON.stringify(finding.reoccurrence);
      if (reoccurrenceChanged) changedFields.push("reoccurrence");
      if (changedFields.length) {
        const statusNote = prior.status !== finding.status ? ` Status: ${prior.status} → ${finding.status}.` : "";
        events.push(makeEvent("review-finding-updated", `Review finding updated: ${finding.title}. Changed: ${changedFields.join(", ")}.${statusNote}`, at));
      }
      const priorSources = new Set(prior.sourceBundleNames);
      const newSources = finding.sourceBundleNames.filter((source) => !priorSources.has(source));
      if (newSources.length) events.push(makeEvent("review-finding-reobserved", `Review finding seen in additional bundle(s): ${newSources.join(", ")}.`, at));
      if (reoccurrenceChanged && finding.reoccurrence?.state === "unreviewed") {
        events.push(makeEvent("review-finding-reoccurrence-detected", `Previously ${finding.reoccurrence.previousStatus} finding reappeared in ${finding.reoccurrence.sourceBundleName || "a later release bundle"}: ${finding.title}.`, at));
      }
      if (reoccurrenceChanged && finding.reoccurrence?.state === "reopened") {
        events.push(makeEvent("review-finding-reopened", `Recurring review finding reopened: ${finding.title}.`, at));
      }
    }
    for (const prior of currentFindings) {
      if (!afterById.has(prior.id)) events.push(makeEvent("review-finding-removed", `Review finding removed from tracking: ${prior.title}.`, at));
    }
    next.reviewFindings = incomingFindings;
  }
  if (events.length) {
    next.updatedAt = at;
    next.auditTrail = [...safeArray(next.auditTrail), ...events].slice(-50);
  }
  return next;
}

export function updateArchitectureDecisionRecords(records, recordId, patch, options = {}) {
  let found = false;
  const next = safeArray(records).map((record) => {
    if (record?.id !== recordId) return record;
    found = true;
    return updateArchitectureDecisionRecord(record, patch, options);
  });
  if (!found) throw new Error(`Architecture decision record not found: ${recordId}.`);
  return next;
}

const display = (value) => value == null || value === "" ? "Unavailable" : String(value);
function metricDisplay(value, key) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  if (key === "successRate") return `${(value * 100).toFixed(2)}%`;
  if (key === "throughputRps") return `${value.toFixed(2)} req/s`;
  if (key === "p95LatencyMs") return `${value.toFixed(2)} ms`;
  return String(Number(value.toFixed(2)));
}

/** Format a decision record as Markdown with both its decision and preserved evidence context. */
export function formatArchitectureDecisionRecordMarkdown(record = {}, options = {}) {
  const report = isRecord(record.reportSnapshot) ? record.reportSnapshot : {};
  const gates = safeArray(record.validationGates);
  const trail = safeArray(record.auditTrail);
  const workQueueTasks = normalizeRemediationWorkQueueTasks(record.workQueueTasks);
  const workQueueSummary = buildRemediationWorkQueue([record], {
    loadTestRecords: safeArray(options.loadTestRecords),
    now: options.now || new Date(),
  });
  return [
    `# ${display(record.title || "Architecture decision record")}`,
    "",
    `- **Status:** ${display(record.status)}`,
    `- **Owner:** ${display(record.owner)}`,
    `- **Created:** ${display(record.createdAt)}`,
    `- **Last updated:** ${display(record.updatedAt)}`,
    `- **Baseline:** ${display(record.baselineName || report.baselineName)}`,
    `- **Proposed architecture:** ${display(record.proposedName || report.proposedName)}`,
    "",
    "## Recorded decision rationale",
    "",
    display(record.rationale || "No human decision rationale recorded."),
    "",
    "## Recommendation at decision time",
    "",
    `**${display(report.recommendation)}**`,
    display(report.sourceRationale),
    `Confidence: ${display(report.confidence)}. Simulation evidence: ${display(report.simulationStatus)} — ${display(report.simulationReason)}`,
    "",
    "## Architecture changes",
    "",
    ...(safeArray(report.changes).length ? report.changes.map((change) => `- **${display(change.action)} ${display(change.subjectType)}:** ${display(change.label)}${change.detail ? ` — ${change.detail}` : ""}`) : ["No architecture change details were recorded."]),
    "",
    "## Simulation metric snapshot",
    "",
    "| Metric | Baseline | Proposed | Delta | Direction |",
    "|---|---:|---:|---:|---|",
    ...(safeArray(report.metrics).length ? report.metrics.map((metric) => {
      const delta = metric.delta == null ? "Unavailable" : metric.key === "successRate"
        ? `${metric.delta > 0 ? "+" : ""}${(metric.delta * 100).toFixed(2)} percentage points`
        : `${metric.delta > 0 ? "+" : ""}${metricDisplay(metric.delta, metric.key)}`;
      return `| ${display(metric.label)} | ${metricDisplay(metric.before, metric.key)} | ${metricDisplay(metric.after, metric.key)} | ${delta} | ${display(metric.direction)} |`;
    }) : ["| — | — | — | — | Unavailable |"]),
    "",
    "## Validation gates",
    "",
    ...(gates.length ? gates.map((gate) => `- [${gate.done ? "x" : " "}] ${gate.label}${gate.done && gate.completedAt ? ` (completed ${gate.completedAt})` : ""}`) : ["No validation gates were recorded."]),
    `\n**Outstanding gates:** ${gates.filter((gate) => !gate.done).length}`,
    "",
    "## Remediation work queue ownership and due dates",
    "",
    ...(workQueueTasks.length ? workQueueTasks.map((task) => [
      `### Task ${display(task.taskId)}`,
      `- **Task assignee:** ${display(task.assignee || "Unassigned")}`,
      `- **Due date:** ${display(task.dueDate || "Not set")}`,
      `- **Task metadata updated:** ${display(task.updatedAt)}`,
      ...(task.escalationAcknowledgement ? [
        `- **Escalation acknowledgement:** ${display(task.escalationAcknowledgement.acknowledgedAt)} by ${display(task.escalationAcknowledgement.acknowledgedBy)} (state fingerprint ${display(task.escalationAcknowledgement.fingerprint)}).`,
        `  - Note: ${display(task.escalationAcknowledgement.note)}`,
      ] : []),
      ...(task.taskResolution ? [
        `- **Task-level resolution status:** ${display(task.taskResolution.status)}${task.taskResolution.resolvedAt ? ` · recorded ${display(task.taskResolution.resolvedAt)} by ${display(task.taskResolution.resolvedBy)}` : ""}`,
        ...(task.taskResolution.note ? [`  - Resolution/reopen note: ${display(task.taskResolution.note || task.taskResolution.reopenNote)}`] : []),
        ...(task.taskResolution.evidenceReference ? [`  - Resolution reference: ${display(task.taskResolution.evidenceReference)}`] : []),
      ] : []),
      ...(task.resolutionHistory.length ? ["- **Prior task resolutions:**", ...task.resolutionHistory.map((entry) => `  - ${display(entry.resolvedAt)} by ${display(entry.resolvedBy)} — ${display(entry.note)}${entry.supersededReason ? ` (superseded: ${display(entry.supersededReason)})` : ""}`)] : []),
      ...(task.followUpNotes.length ? ["- **Follow-up notes:**", ...task.followUpNotes.map((note) => `  - ${display(note.at)} · ${display(note.author)} (${display(note.type)}): ${display(note.note)}`)] : []),
      ...(task.auditTrail.length ? ["- **Task audit history:**", ...task.auditTrail.map((event) => `  - ${display(event.at)} — ${display(event.message)}`)] : ["- **Task audit history:** no changes recorded"]),
      "",
    ].join("\n")) : ["No queue-level assignment or due-date metadata has been recorded."]),
    "Task assignment is separate from finding ownership and does not alter finding status, evidence, or verification snapshots.",
    "",
    "## Work queue accountability snapshot",
    "",
    `Evaluated ${display(workQueueSummary.evaluatedDate)}. Upcoming window: through ${display(workQueueSummary.upcomingDeadlineThrough)} (${workQueueSummary.upcomingDeadlineWindowDays} days, including today). This Markdown export summarizes the selected decision record only; the in-app queue aggregates all saved decision records in the document.`,
    `**Active tasks:** ${workQueueSummary.totalCount} · **Upcoming deadlines:** ${workQueueSummary.upcomingDeadlineCount} · **Overdue tasks:** ${workQueueSummary.overdueCount} · **Overdue rollout blockers:** ${workQueueSummary.escalationSummary.overdueBlockerCount}.`,
    `**Resolved queue tasks:** ${workQueueSummary.totalResolvedCount} · **Acknowledged overdue blockers:** ${workQueueSummary.escalationSummary.acknowledgedCount} · **Unacknowledged overdue blockers:** ${workQueueSummary.escalationSummary.unacknowledgedCount}. Marking a queue task resolved does not modify the underlying finding disposition or clear rollout readiness blockers.`,
    "",
    "### Workload by assignee",
    "",
    "| Assignee | Tasks | Blockers | Overdue | Overdue blockers | Deadlines next 7 days | Decision records |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...(workQueueSummary.assigneeWorkloads.length ? workQueueSummary.assigneeWorkloads.map((summary) => `| ${display(summary.assignee)} | ${summary.taskCount} | ${summary.blockingCount} | ${summary.overdueCount} | ${summary.overdueBlockerCount} | ${summary.upcomingDeadlineCount} | ${summary.affectedDecisionRecordCount} |`) : ["| — | 0 | 0 | 0 | 0 | 0 | 0 |"]),
    ...(workQueueSummary.assigneeWorkloadsTruncated ? ["Showing the highest-priority 100 assignee summaries; counts cover all derived tasks."] : []),
    "",
    "### Upcoming deadlines",
    "",
    ...(workQueueSummary.upcomingDeadlines.length ? workQueueSummary.upcomingDeadlines.map((task) => `- **${display(task.dueDate)} — ${display(task.kindLabel)}:** ${display(task.findingTitle)} · ${display(task.assignee || "Unassigned")}${task.blocksRollout ? " · Rollout blocker" : ""}.`) : ["No active tasks are due in the upcoming window." ]),
    ...(workQueueSummary.upcomingDeadlinesTruncated ? ["Only the ten soonest deadlines are shown."] : []),
    "",
    "### Overdue blocker escalation",
    "",
    ...(workQueueSummary.escalationSummary.overdueBlockerCount ? [
      `${workQueueSummary.escalationSummary.overdueBlockerCount} overdue rollout-blocking task(s) across ${workQueueSummary.escalationSummary.affectedDecisionRecordCount} decision record(s); ${workQueueSummary.escalationSummary.unassignedOverdueBlockerCount} unassigned. Oldest due date: ${display(workQueueSummary.escalationSummary.oldestDueDate)} (${workQueueSummary.escalationSummary.oldestDaysOverdue} day(s) overdue).`,
      ...workQueueSummary.escalationSummary.items.map((task) => `- **${display(task.dueDate)} (${task.daysOverdue} days overdue):** ${display(task.findingTitle)} · ${display(task.assignee || "Unassigned")} · ${display(task.recordTitle)}.`),
      ...(workQueueSummary.escalationSummary.truncated ? ["Only the five oldest overdue blockers are shown."] : []),
    ] : ["No overdue rollout-blocking tasks were detected at export time."]),
    "",
    "These are derived follow-up summaries, not notifications or an approval to deploy. Overdue status does not establish that an assignee has been contacted.",
    "",
    "## Escalation review & handoff notes",
    "",
    ...(normalizeRemediationHandoffNotes(record.handoffNotes).length ? normalizeRemediationHandoffNotes(record.handoffNotes).map((entry) => [
      `### ${display(entry.createdAt)} — ${display(entry.author)}`,
      `- **Handed to:** ${display(entry.handedTo || "Not specified")}`,
      entry.note,
      ...(entry.receipt ? [
        `- **Manual receipt attestation:** ${display(entry.receipt.status)} by ${display(entry.receipt.reviewer)} at ${display(entry.receipt.recordedAt)}.`,
        ...(entry.receipt.note ? [`- **Receipt note:** ${display(entry.receipt.note)}`] : []),
        "- Receipt is a manual attestation, not proof of external delivery or independent verification.",
      ] : []),
      ...(entry.summarySnapshot ? [
        `- **Queue snapshot at note time:** ${display(entry.summarySnapshot.asOfDate)}; ${entry.summarySnapshot.activeTaskCount} active task(s), ${entry.summarySnapshot.resolvedTaskCount} resolved task(s), ${entry.summarySnapshot.openRolloutBlockerCount} open rollout blocker(s).`,
        `- **Category counts:** acknowledged blockers ${entry.summarySnapshot.counts.acknowledgedBlockers}; unresolved follow-ups ${entry.summarySnapshot.counts.unresolvedFollowUps}; overdue tasks ${entry.summarySnapshot.counts.overdueTasks}; resolved tasks with open findings ${entry.summarySnapshot.counts.resolvedTasksWithOpenFindings}.`,
      ] : []),
      "",
    ].join("\n")) : ["No escalation handoff notes have been recorded for this decision record."]),
    "Handoff notes are manual workflow context. They do not alter the report snapshot, finding dispositions, verification runs, or original source evidence.",
    "",
    "## Rollout readiness",
    "",
    (() => {
      const readiness = buildRolloutReadiness(record, options);
      return `**Status:** ${readiness.label} (${readiness.completeCount}/${readiness.totalCount} checks complete).`;
    })(),
    ...buildRolloutReadiness(record, options).checks.map((check) => `- [${check.state === "complete" ? "x" : " "}] **${check.state.toUpperCase()} — ${check.label}** ${check.detail}`),
    buildRolloutReadiness(record, options).disclaimer,
    "",
    "## Release review findings and remediation",
    "",
    (() => {
      const findings = normalizeDecisionReviewFindings(record.reviewFindings);
      const counts = {
        open: findings.filter((finding) => finding.status === "open").length,
        blocking: findings.filter((finding) => finding.status === "open" && finding.severity === "error").length,
        acceptedRisk: findings.filter((finding) => finding.status === "accepted-risk").length,
        resolved: findings.filter((finding) => finding.status === "resolved").length,
      };
      return `**Tracked:** ${findings.length} · **Open:** ${counts.open} · **Open error findings blocking rollout:** ${counts.blocking} · **Accepted risks:** ${counts.acceptedRisk} · **Resolved:** ${counts.resolved}`;
    })(),
    "",
    ...(normalizeDecisionReviewFindings(record.reviewFindings).length ? normalizeDecisionReviewFindings(record.reviewFindings).map((finding) => [
      `### ${finding.title}`,
      `- **Severity / status:** ${finding.severity} / ${finding.status}`,
      ...(finding.reoccurrence ? [`- **Reoccurrence:** ${finding.reoccurrence.state}; previously ${finding.reoccurrence.previousStatus}; detected ${display(finding.reoccurrence.detectedAt)} in ${display(finding.reoccurrence.sourceBundleName)}${finding.reoccurrence.reviewedAt ? `; reviewed ${display(finding.reoccurrence.reviewedAt)}` : "; reviewer action required"}`] : []),
      `- **Owner:** ${display(finding.owner)}`,
      `- **Code:** ${display(finding.code)}`,
      `- **Detail:** ${display(finding.detail)}`,
      `- **Rationale:** ${display(finding.rationale)}`,
      `- **Supporting evidence submitted:** ${display(finding.evidence)}`,
      `- **Quantitative acceptance criteria:** ${Object.keys(finding.acceptanceCriteria || {}).length ? Object.entries(finding.acceptanceCriteria).map(([key, target]) => `${display(key)} = ${target}`).join("; ") : "Not configured"}`,
      `- **Remediation effectiveness:** ${buildRemediationEffectivenessSummary(finding, options).label}`,
      ...(Object.keys(finding.acceptanceCriteria || {}).length ? [`- **Quantitative acceptance evaluation:** ${buildRemediationEffectivenessSummary(finding, options).acceptanceEvaluation.status} — ${display(buildRemediationEffectivenessSummary(finding, options).acceptanceEvaluation.reason)}`,
        ...buildRemediationEffectivenessSummary(finding, options).acceptanceEvaluation.criteria.map((criterion) => `  - ${criterion.label}: ${criterion.state}; target ${criterion.comparator} ${criterion.target} ${criterion.unit}; before ${criterion.before === null ? "not supplied" : criterion.before}; after ${criterion.after === null ? "not supplied" : criterion.after}${criterion.delta === null ? "" : `; delta ${criterion.delta}`}`)] : []),
      ...(finding.remediationVerification?.verifiedAt ? [`- **Last reviewer verification:** ${display(finding.remediationVerification.verifiedBy)} on ${display(finding.remediationVerification.verifiedAt)} — ${display(finding.remediationVerification.rationale)}${finding.remediationVerification.status === "superseded" ? ` (historical only; ${display(finding.remediationVerification.supersededReason)})` : ""}`] : []),
      ...(finding.verificationRuns.length ? [`- **Verification runs:**`, ...finding.verificationRuns.map((run) => `  - ${display(run.recordedAt)} · ${display(run.runType)} · ${display(run.outcome).toUpperCase()} · recorded by ${display(run.recordedBy)}. Before: ${display(run.beforeState)}. After: ${display(run.afterState)}. Summary: ${display(run.summary)}. Evidence: ${display(run.evidence)}${Object.keys(run.acceptanceCriteriaSnapshot || {}).length ? ` · quantitative criteria ${display(run.acceptanceEvaluation.status)} (${run.acceptanceEvaluation.passedCount} passed, ${run.acceptanceEvaluation.failedCount} failed, ${run.acceptanceEvaluation.unevaluatedCount} unevaluated)` : " · no numeric acceptance criteria were snapshotted"}${Object.entries(run.measurements || {}).some(([, values]) => values.before !== null || values.after !== null) ? ` · measurements ${Object.entries(run.measurements).filter(([, values]) => values.before !== null || values.after !== null).map(([key, values]) => `${key}: ${values.before ?? "n/a"} → ${values.after ?? "n/a"}`).join("; ")}` : ""}${run.measurementSourceEvaluation ? ` · measurement source traceability ${run.measurementSourceEvaluation.status} (${run.measurementSourceEvaluation.linkedCount} linked, ${run.measurementSourceEvaluation.unlinkedCount} unlinked, ${run.measurementSourceEvaluation.incompleteCount} incomplete, ${run.measurementSourceEvaluation.mismatchCount} inconsistent)` : " · measurement source traceability unavailable"}${Object.entries(run.measurementSources || {}).flatMap(([metric, sides]) => ["before", "after"].filter((side) => sides[side]?.sourceType).map((side) => `${metric} ${side}: ${sides[side].sourceType}; field ${sides[side].sourceField || "missing"}; value ${sides[side].sourceValue ?? "n/a"}; ref ${sides[side].evidenceReference || sides[side].sourceRecordId || "missing"}${sides[side].transformation ? `; transform ${sides[side].transformation}` : ""}`)).length ? ` · source mappings: ${Object.entries(run.measurementSources || {}).flatMap(([metric, sides]) => ["before", "after"].filter((side) => sides[side]?.sourceType).map((side) => `${metric} ${side}: ${sides[side].sourceType}; field ${sides[side].sourceField || "missing"}; value ${sides[side].sourceValue ?? "n/a"}; ref ${sides[side].evidenceReference || sides[side].sourceRecordId || "missing"}${sides[side].transformation ? `; transform ${sides[side].transformation}` : ""}`)).join(" | ")}` : ""}${run.reviewerVerifiedAt ? ` · reviewer-confirmed ${display(run.reviewerVerifiedBy)} on ${display(run.reviewerVerifiedAt)}: ${display(run.verificationRationale)}` : " · submitted run, not reviewer-confirmed as effective"}${run.verificationSupersededAt ? ` · superseded on ${display(run.verificationSupersededAt)}: ${display(run.verificationSupersededReason)}` : ""}`)] : []),
      ...(Array.isArray(options.loadTestRecords) && finding.verificationRuns.length ? [
        "- **Current load-test source drift review:**",
        ...finding.verificationRuns.flatMap((run) => {
          const drift = evaluateRemediationMeasurementSourceDrift(run.measurementSources, options.loadTestRecords);
          if (["not-applicable", "not-evaluated"].includes(drift.status)) return [];
          return [`  - ${display(run.recordedAt)}: ${display(drift.status)} — ${display(drift.reason)}`,
            ...drift.items.filter((item) => item.state !== "unchanged").map((item) => `    - ${display(item.metricLabel)} ${display(item.side)} (${display(item.sourceRecordId)}): ${display(item.state)} — ${display(item.changes.map((change) => change.detail).join("; "))}`)];
        }),
      ] : []),
      ...(finding.sourceDriftReviews?.length ? [
        "- **Source drift resolution history:**",
        ...finding.sourceDriftReviews.map((review) => `  - ${display(review.reviewedAt)} · run ${display(review.runId)} · ${display(review.metricLabel)} ${display(review.side)} (${display(review.sourceRecordId)}) · ${display(review.disposition)} · reviewer ${display(review.reviewer)}. Rationale: ${display(review.rationale)}. Original source ${display(review.originalSnapshot?.recordMetadata?.name || "unnamed")} (${display(review.originalSnapshot?.sourceField || "missing field")}: ${review.originalSnapshot?.sourceValue ?? "unavailable"}); current-at-review source ${display(review.currentSnapshot?.recordMetadata?.name || "missing")} (${display(review.currentSnapshot?.sourceField || "missing field")}: ${review.currentSnapshot?.sourceValue ?? "unavailable"}). Original/current workload: ${display(JSON.stringify(review.originalSnapshot?.workload || {}))} → ${display(JSON.stringify(review.currentSnapshot?.workload || {}))}. Snapshot differences: ${display((review.changes || []).map((change) => `${change.label}: ${change.detail}`).join("; "))}`),
      ] : []),
      `- **Sources:** ${display(finding.sourceBundleNames.join(", "))}`,
      ...(finding.freshEvidenceRequired ? [`- **Fresh evidence required:** yes; requested ${display(finding.freshEvidenceRequestedAt)}; prior evidence retained as historical context: ${display(finding.previousEvidence)}`] : []),
      ...(finding.sourceBundleObservations.length ? [`- **Observation timeline:**`, ...finding.sourceBundleObservations.map((observation) => `  - ${display(observation.observedAt)} — ${display(observation.sourceName)}${observation.findingSnapshot ? `: ${display(observation.findingSnapshot.severity)} / ${display(observation.findingSnapshot.title)} — ${display(observation.findingSnapshot.detail)}` : " (legacy observation; detail snapshot unavailable)"}`)] : []),
      ...(finding.auditTrail.length ? ["- **Finding audit trail:**", ...finding.auditTrail.map((event) => `  - ${display(event.at)} — ${display(event.message)}`)] : []),
      "",
    ].join("\n")) : ["No release-bundle review findings are being tracked."]),
    "Open error-severity findings block rollout readiness. A Resolved disposition or evidence reference does not itself establish effectiveness: a passing verification run must be explicitly confirmed by a reviewer, and prior verification becomes historical if the finding reappears or a newer run supersedes it. Accepted Risk and Resolved findings remain visible; this record does not independently authenticate external evidence or approve production deployment.",
    "",
    "## Risks and limitations",
    "",
    ...(safeArray(report.risks).length ? report.risks.map((risk) => `- ${risk}`) : ["No report risks were recorded."]),
    ...(safeArray(report.limitations).map((limitation) => `- Limitation: ${limitation}`)),
    "",
    "## Decision audit trail",
    "",
    ...(trail.length ? trail.map((event) => `- ${display(event.at)} — ${display(event.message)}`) : ["No audit events recorded."]),
    "",
    "---",
    "Preserved by Sketchizi Workbench. Accepted status is a recorded review decision, not proof that outstanding validation gates have passed or that production rollout is safe.",
    "",
  ].join("\n");
}

export const ARCHITECTURE_DECISION_STATUSES = [
  { value: "proposed", label: "Proposed" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "deferred", label: "Deferred" },
];
