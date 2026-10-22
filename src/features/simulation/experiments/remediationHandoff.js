const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const text = (value, max = 1200) => String(value ?? "").trim().slice(0, max);
const validTimestamp = (value, fallback = "") => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const MAX_HANDOFF_NOTES = 30;
const MAX_TASK_REFERENCES_PER_CATEGORY = 12;
const MAX_HANDOFF_REPORT_NOTES = 100;
const CATEGORY_KEYS = Object.freeze([
  "acknowledgedBlockers",
  "unresolvedFollowUps",
  "overdueTasks",
  "resolvedTasksWithOpenFindings",
]);
const CATEGORY_LABELS = Object.freeze({
  acknowledgedBlockers: "Acknowledged rollout blockers",
  unresolvedFollowUps: "Unresolved follow-ups",
  overdueTasks: "Overdue tasks",
  resolvedTasksWithOpenFindings: "Resolved queue tasks whose findings remain open",
});

function normalizeTaskReference(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id, 1000);
  if (!id) return null;
  return {
    id,
    kind: text(value.kind, 80),
    kindLabel: text(value.kindLabel, 120),
    recordId: text(value.recordId, 140),
    recordTitle: text(value.recordTitle, 180),
    findingId: text(value.findingId, 140),
    findingCode: text(value.findingCode, 100),
    findingTitle: text(value.findingTitle, 240),
    severity: ["error", "warning", "info"].includes(value.severity) ? value.severity : "info",
    findingStatus: text(value.findingStatus, 40),
    assignee: text(value.assignee, 120),
    owner: text(value.owner, 120),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(text(value.dueDate, 10)) ? text(value.dueDate, 10) : "",
    daysOverdue: nonNegativeInteger(value.daysOverdue),
    blocksRollout: value.blocksRollout === true,
    isOverdue: value.isOverdue === true,
    isEscalationAcknowledged: value.isEscalationAcknowledged === true,
    priority: text(value.priority, 30),
    reason: text(value.reason, 1000),
  };
}

function normalizeCategorySnapshot(value) {
  const source = isRecord(value) ? value : {};
  const count = nonNegativeInteger(source.count);
  const items = safeArray(source.items).slice(0, MAX_TASK_REFERENCES_PER_CATEGORY).map(normalizeTaskReference).filter(Boolean);
  return {
    count,
    items,
    truncated: source.truncated === true || count > items.length,
  };
}

export function normalizeRemediationHandoffSummary(value) {
  if (!isRecord(value)) return null;
  const categories = {};
  for (const key of CATEGORY_KEYS) categories[key] = normalizeCategorySnapshot(value[key]);
  return {
    asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(text(value.asOfDate, 10)) ? text(value.asOfDate, 10) : "",
    activeTaskCount: nonNegativeInteger(value.activeTaskCount),
    resolvedTaskCount: nonNegativeInteger(value.resolvedTaskCount),
    openRolloutBlockerCount: nonNegativeInteger(value.openRolloutBlockerCount),
    ...categories,
    disclaimer: text(value.disclaimer || "Derived handoff summary; not a deployment approval or independent evidence verification.", 500),
  };
}

function summarySnapshotFromQueueSummary(summaryValue) {
  const summary = normalizeRemediationHandoffSummary(summaryValue);
  if (!summary) return null;
  const counts = {};
  for (const key of CATEGORY_KEYS) counts[key] = summary[key].count;
  const references = {};
  for (const key of CATEGORY_KEYS) references[key] = summary[key].items.slice(0, 8).map((item) => ({
    id: item.id,
    recordId: item.recordId,
    recordTitle: item.recordTitle,
    findingId: item.findingId,
    findingCode: item.findingCode,
    findingTitle: item.findingTitle,
    kind: item.kind,
    severity: item.severity,
    assignee: item.assignee,
    dueDate: item.dueDate,
    blocksRollout: item.blocksRollout,
    findingStatus: item.findingStatus,
  }));
  return {
    asOfDate: summary.asOfDate,
    activeTaskCount: summary.activeTaskCount,
    resolvedTaskCount: summary.resolvedTaskCount,
    openRolloutBlockerCount: summary.openRolloutBlockerCount,
    counts,
    references,
    classification: "point-in-time-derived-work-queue-summary",
  };
}

const HANDOFF_ACTION_STATUSES = Object.freeze(["open", "in-progress", "closed"]);

function normalizeHandoffAction(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id, 180), taskId = text(value.taskId, 1000);
  const owner = text(value.owner, 120), dueDate = text(value.dueDate, 10), closureCriteria = text(value.closureCriteria, 1200);
  if (!id || !taskId || !owner || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !closureCriteria) return null;
  const status = HANDOFF_ACTION_STATUSES.includes(value.status) ? value.status : "open";
  const history = safeArray(value.history).slice(-50).filter(isRecord).map((event) => ({
    at: validTimestamp(event.at), actor: text(event.actor, 120), event: text(event.event, 80),
    detail: text(event.detail, 1200), snapshot: isRecord(event.snapshot) ? {
      status: HANDOFF_ACTION_STATUSES.includes(event.snapshot.status) ? event.snapshot.status : "open",
      owner: text(event.snapshot.owner, 120), dueDate: text(event.snapshot.dueDate, 10),
      closureCriteria: text(event.snapshot.closureCriteria, 1200), closureEvidence: text(event.snapshot.closureEvidence, 1200),
    } : null,
  })).filter((event) => event.at && event.actor && event.event);
  const closureEvidence = text(value.closureEvidence, 1200);
  return {
    id, taskId, category: text(value.category, 80), findingCode: text(value.findingCode, 100),
    severity: ["error", "warning", "info"].includes(value.severity) ? value.severity : "info",
    blocksRollout: value.blocksRollout === true,
    findingTitle: text(value.findingTitle, 240), recordId: text(value.recordId, 140),
    owner, dueDate, closureCriteria, status, closureEvidence,
    parentActionId: text(value.parentActionId, 180),
    closureReviews: safeArray(value.closureReviews).slice(-20).filter(isRecord).map((review) => ({
      id: text(review.id, 180), reviewer: text(review.reviewer, 120),
      decision: ["accepted", "rejected"].includes(review.decision) ? review.decision : "",
      rationale: text(review.rationale, 1200), reviewedAt: validTimestamp(review.reviewedAt),
      classification: "manual-closure-review", independentlyVerified: false,
    })).filter((review) => review.id && review.reviewer && review.decision && review.rationale && review.reviewedAt),
    createdAt: validTimestamp(value.createdAt), updatedAt: validTimestamp(value.updatedAt),
    history, classification: "manual-handoff-follow-up-action", independentlyVerified: false,
  };
}

function actionSnapshot(action) {
  return { status: action.status, owner: action.owner, dueDate: action.dueDate, closureCriteria: action.closureCriteria, closureEvidence: action.closureEvidence || "" };
}

/** Create explicit carry-forward actions from a reconciliation result. */
export function createRemediationHandoffActions(noteValue, reconciliationValue, { owner, dueDate, closureCriteria } = {}, { createdAt = new Date().toISOString(), actor = owner } = {}) {
  const note = normalizeRemediationHandoffNotes([noteValue])[0];
  if (!note) throw new TypeError("Select an existing handoff note before creating follow-up actions.");
  const reconciliation = isRecord(reconciliationValue) ? reconciliationValue : {};
  if (reconciliation.handoffNoteId !== note.id) throw new TypeError("The reconciliation must belong to the selected handoff note.");
  const normalizedOwner = text(owner, 120), normalizedDueDate = text(dueDate, 10), criteria = text(closureCriteria, 1200), at = validTimestamp(createdAt);
  if (!normalizedOwner) throw new TypeError("Assign an owner to every carry-forward action.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDueDate) || Number.isNaN(Date.parse(`${normalizedDueDate}T00:00:00Z`))) throw new TypeError("Enter a valid due date for carry-forward actions.");
  if (!criteria) throw new TypeError("Define closure criteria before creating carry-forward actions.");
  if (!at || !text(actor, 120)) throw new TypeError("Record a valid action author and timestamp.");
  const existing = safeArray(note.followUpActions).map(normalizeHandoffAction).filter(Boolean);
  const existingKeys = new Set(existing.map((action) => `${action.taskId}:${action.category}`));
  const additions = safeArray(reconciliation.carryForward).filter((item) => isRecord(item) && text(item.taskId, 1000))
    .filter((item) => !existingKeys.has(`${text(item.taskId, 1000)}:${text(item.category, 80)}`))
    .map((item, index) => {
      const action = {
        id: `handoff-action-${Date.parse(at)}-${index + 1}-${text(item.taskId, 80).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        taskId: text(item.taskId, 1000), category: text(item.category, 80), findingCode: text(item.findingCode, 100),
        severity: ["error", "warning", "info"].includes(item.severity) ? item.severity : "info", blocksRollout: item.blocksRollout === true,
        findingTitle: text(item.findingTitle, 240), recordId: text(item.recordId, 140), owner: normalizedOwner,
        dueDate: normalizedDueDate, closureCriteria: criteria, status: "open", closureEvidence: "",
        parentActionId: "", closureReviews: [],
        createdAt: at, updatedAt: at, history: [], classification: "manual-handoff-follow-up-action", independentlyVerified: false,
      };
      action.history.push({ at, actor: text(actor, 120), event: "created-from-reconciliation", detail: text(item.reason, 1200), snapshot: actionSnapshot(action) });
      return action;
    });
  const nextActions = [...existing, ...additions].slice(-200);
  const nextNotes = normalizeRemediationHandoffNotes([ { ...note, followUpActions: nextActions } ]);
  return { note: nextNotes[0], actions: nextActions, createdCount: additions.length, changed: additions.length > 0 };
}

/** Update an action while retaining a bounded append-only change history. */
export function updateRemediationHandoffAction(noteValue, actionId, patchValue, { updatedAt = new Date().toISOString(), actor } = {}) {
  const note = normalizeRemediationHandoffNotes([noteValue])[0];
  if (!note) throw new TypeError("Select an existing handoff note before updating an action.");
  const patch = isRecord(patchValue) ? patchValue : {};
  const at = validTimestamp(updatedAt), who = text(actor, 120);
  if (!at || !who) throw new TypeError("Record the action reviewer and timestamp.");
  const actions = safeArray(note.followUpActions).map(normalizeHandoffAction).filter(Boolean);
  const target = actions.find((action) => action.id === text(actionId, 180));
  if (!target) throw new TypeError("Select an existing follow-up action.");
  const owner = Object.hasOwn(patch, "owner") ? text(patch.owner, 120) : target.owner;
  const dueDate = Object.hasOwn(patch, "dueDate") ? text(patch.dueDate, 10) : target.dueDate;
  const closureCriteria = Object.hasOwn(patch, "closureCriteria") ? text(patch.closureCriteria, 1200) : target.closureCriteria;
  const status = Object.hasOwn(patch, "status") ? patch.status : target.status;
  const closureEvidence = Object.hasOwn(patch, "closureEvidence") ? text(patch.closureEvidence, 1200) : target.closureEvidence;
  if (!owner) throw new TypeError("A follow-up action must have an owner.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) throw new TypeError("A follow-up action must have a valid due date.");
  if (!closureCriteria) throw new TypeError("A follow-up action must define closure criteria.");
  if (!HANDOFF_ACTION_STATUSES.includes(status)) throw new TypeError("Choose a valid follow-up action status.");
  if (status === "closed" && !closureEvidence) throw new TypeError("Provide closure evidence before closing a follow-up action.");
  if (target.status === "closed" && status !== "closed") throw new TypeError("Closed actions are immutable; create a new action if work must reopen.");
  const updated = { ...target, owner, dueDate, closureCriteria, status, closureEvidence, updatedAt: at };
  if (JSON.stringify(actionSnapshot(updated)) !== JSON.stringify(actionSnapshot(target))) {
    updated.history = [...target.history, { at, actor: who, event: status === "closed" ? "closed" : "updated", detail: status === "closed" ? "Closure evidence recorded." : "Follow-up action updated.", snapshot: actionSnapshot(updated) }].slice(-50);
  }
  const nextActions = actions.map((action) => action.id === target.id ? updated : action);
  const nextNotes = normalizeRemediationHandoffNotes([{ ...note, followUpActions: nextActions }]);
  return { note: nextNotes[0], action: nextActions.find((action) => action.id === target.id), changed: true };
}

/**
 * Record a human review of closure evidence. Rejected closure reviews create a
 * new linked action rather than reopening or mutating the closed action.
 */
export function reviewRemediationHandoffClosure(noteValue, actionId, {
  reviewer, decision, rationale, owner, dueDate, closureCriteria,
} = {}, { reviewedAt = new Date().toISOString(), id } = {}) {
  const note = normalizeRemediationHandoffNotes([noteValue])[0];
  if (!note) throw new TypeError("Select an existing handoff note before reviewing closure.");
  const who = text(reviewer, 120), why = text(rationale, 1200), at = validTimestamp(reviewedAt);
  if (!who) throw new TypeError("Enter the closure reviewer.");
  if (!["accepted", "rejected"].includes(decision)) throw new TypeError("Choose accepted or rejected.");
  if (!why) throw new TypeError("Record the rationale for the closure review.");
  if (!at) throw new TypeError("Enter a valid closure review timestamp.");
  const actions = safeArray(note.followUpActions).map(normalizeHandoffAction).filter(Boolean);
  const target = actions.find((action) => action.id === text(actionId, 180));
  if (!target) throw new TypeError("Select an existing follow-up action.");
  if (target.status !== "closed") throw new TypeError("Only closed actions with recorded closure evidence can receive a closure review.");
  if (!target.closureEvidence) throw new TypeError("The action has no closure evidence to review.");
  const review = {
    id: text(id || `closure-review-${Date.parse(at) || 0}-${target.id}`, 180),
    reviewer: who, decision, rationale: why, reviewedAt: at,
    classification: "manual-closure-review", independentlyVerified: false,
  };
  if (target.closureReviews.some((item) => item.id === review.id)) throw new TypeError("A closure review with this ID already exists.");
  const reviewedTarget = {
    ...target, closureReviews: [...target.closureReviews, review].slice(-20),
    updatedAt: at,
    history: [...target.history, { at, actor: who, event: `closure-review-${decision}`, detail: why, snapshot: actionSnapshot(target) }].slice(-50),
  };
  let nextActions = actions.map((action) => action.id === target.id ? reviewedTarget : action);
  let followUpAction = null;
  if (decision === "rejected") {
    const nextOwner = text(owner, 120), nextDueDate = text(dueDate, 10), nextCriteria = text(closureCriteria, 1200);
    if (!nextOwner) throw new TypeError("Assign an owner to the replacement follow-up action.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate) || Number.isNaN(Date.parse(`${nextDueDate}T00:00:00Z`))) throw new TypeError("Enter a valid due date for the replacement follow-up action.");
    if (!nextCriteria) throw new TypeError("Define closure criteria for the replacement follow-up action.");
    const newId = text(`handoff-action-reopen-${Date.parse(at) || 0}-${target.id}`, 180);
    if (nextActions.some((action) => action.id === newId)) throw new TypeError("A linked replacement action already exists for this review.");
    followUpAction = {
      ...target, id: newId, parentActionId: target.id, owner: nextOwner, dueDate: nextDueDate,
      closureCriteria: nextCriteria, status: "open", closureEvidence: "", closureReviews: [],
      createdAt: at, updatedAt: at,
      history: [{ at, actor: who, event: "created-after-closure-review-rejection", detail: `Linked to closed action ${target.id}. ${why}`, snapshot: { status: "open", owner: nextOwner, dueDate: nextDueDate, closureCriteria: nextCriteria, closureEvidence: "" } }],
    };
    nextActions = [...nextActions, followUpAction].slice(-200);
  }
  const nextNotes = normalizeRemediationHandoffNotes([{ ...note, followUpActions: nextActions }]);
  return { note: nextNotes[0], reviewedAction: nextNotes[0].followUpActions.find((action) => action.id === target.id), followUpAction, review, changed: true };
}

const ESCALATION_DECISIONS = Object.freeze(["escalate", "defer", "dismiss"]);

function normalizeEscalationDecision(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id, 180), actionId = text(value.actionId, 180), decision = ESCALATION_DECISIONS.includes(value.decision) ? value.decision : "";
  const reviewer = text(value.reviewer, 120), rationale = text(value.rationale, 1200), decidedAt = validTimestamp(value.decidedAt);
  const nextReviewDate = /^\d{4}-\d{2}-\d{2}$/.test(text(value.nextReviewDate, 10)) ? text(value.nextReviewDate, 10) : "";
  if (!id || !actionId || !decision || !reviewer || !rationale || !decidedAt || (decision === "defer" && !nextReviewDate)) return null;
  const reviewHistory = safeArray(value.reviewHistory).map((item) => {
    if (!isRecord(item)) return null;
    const reviewId = text(item.id, 180), reviewReviewer = text(item.reviewer, 120), outcome = ["reaffirm", "escalate", "defer", "dismiss"].includes(item.outcome) ? item.outcome : "";
    const reviewRationale = text(item.rationale, 1200), reviewedAt = validTimestamp(item.reviewedAt);
    const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(text(item.nextReviewDate, 10)) ? text(item.nextReviewDate, 10) : "";
    if (!reviewId || !reviewReviewer || !outcome || !reviewRationale || !reviewedAt || (outcome === "defer" && !reviewDate)) return null;
    return { id: reviewId, reviewer: reviewReviewer, outcome, rationale: reviewRationale, reviewedAt, nextReviewDate: reviewDate, evaluatedPolicyId: text(item.evaluatedPolicyId, 100), policyChanged: item.policyChanged === true, classification: "manual-escalation-follow-up-review", independentlyVerified: false };
  }).filter(Boolean).slice(-20);
  return { id, actionId, taskId: text(value.taskId, 1000), policyId: text(value.policyId, 100), decision, reviewer, rationale, decidedAt, nextReviewDate, supersedesDecisionId: text(value.supersedesDecisionId, 180), reviewHistory, classification: "manual-escalation-review-decision", independentlyVerified: false };
}

/** Evaluate configurable escalation rules without mutating actions or canonical findings. */
export function evaluateRemediationHandoffEscalationPolicy(noteValues, {
  asOfDate = new Date().toISOString().slice(0, 10), overdueDays = 1, agingDays = 7,
  severities = ["error", "warning"], rolloutBlockersOnly = false, policyId = "default-escalation-policy",
} = {}) {
  const date = text(asOfDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new TypeError("Enter a valid escalation policy evaluation date.");
  if (!Number.isSafeInteger(overdueDays) || overdueDays < 1 || overdueDays > 365 || !Number.isSafeInteger(agingDays) || agingDays < 1 || agingDays > 365) throw new TypeError("Escalation thresholds must be between 1 and 365 days.");
  if (!Array.isArray(severities) || severities.some((item) => !["error", "warning", "info"].includes(item))) throw new TypeError("Choose valid finding severities for the escalation policy.");
  const normalizedPolicyId = text(policyId, 100);
  if (!normalizedPolicyId) throw new TypeError("Provide an escalation policy ID.");
  const dashboard = buildRemediationHandoffAccountabilityDashboard(noteValues, { asOfDate: date, agingThresholdDays: agingDays });
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const priorAll = notes.flatMap((note) => note.escalationDecisions.map((decision) => ({ ...decision, handoffNoteId: note.id })));
  const supersededDecisionIds = new Set(priorAll.map((decision) => decision.supersedesDecisionId).filter(Boolean));
  const prior = priorAll.filter((decision) => !supersededDecisionIds.has(decision.id));
  const candidates = dashboard.actions.filter((action) => action.status !== "closed" && (!rolloutBlockersOnly || action.blocksRollout === true) && severities.includes(action.severity || "info") && (action.overdueDays >= overdueDays || action.ageDays >= agingDays)).map((action) => {
    const duplicate = prior.find((decision) => decision.actionId === action.id && decision.policyId === normalizedPolicyId && decision.decision !== "dismiss");
    return { actionId: action.id, taskId: action.taskId, handoffNoteId: action.handoffNoteId, owner: action.owner, dueDate: action.dueDate, severity: action.severity || "info", blocksRollout: action.blocksRollout === true, overdueDays: action.overdueDays, ageDays: action.ageDays, reason: action.overdueDays >= overdueDays ? `Overdue threshold met (${action.overdueDays} day(s); policy threshold ${overdueDays}).` : `Aging threshold met (${action.ageDays} day(s); policy threshold ${agingDays}).`, duplicateDecision: duplicate ? { decision: duplicate.decision, reviewer: duplicate.reviewer, decidedAt: duplicate.decidedAt, rationale: duplicate.rationale } : null, requiresHumanDecision: true };
  });
  return { policy: { id: normalizedPolicyId, asOfDate: date, overdueDays, agingDays, severities: [...severities], rolloutBlockersOnly: rolloutBlockersOnly === true }, candidateCount: candidates.length, duplicateDecisionCount: candidates.filter((item) => item.duplicateDecision).length, candidates, classification: "derived-escalation-policy-evaluation", disclaimer: "Policy results are recommendations only. They do not notify anyone, change task status, alter canonical finding disposition, or clear rollout blockers. Duplicate detection only covers retained handoff notes and decisions." };
}

/** Append a human escalation decision to the owning handoff note. */
export function recordRemediationHandoffEscalationDecision(noteValues, noteId, actionId, { reviewer, decision, rationale, nextReviewDate = "", policyId = "default-escalation-policy", supersedesDecisionId = "" } = {}, { decidedAt = new Date().toISOString(), id } = {}) {
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const note = notes.find((entry) => entry.id === text(noteId, 160));
  if (!note) throw new TypeError("Select the handoff note that owns this escalation action.");
  const action = note.followUpActions.find((entry) => entry.id === text(actionId, 180));
  if (!action) throw new TypeError("Select an existing follow-up action before recording an escalation decision.");
  const who = text(reviewer, 120), why = text(rationale, 1200), at = validTimestamp(decidedAt), policy = text(policyId, 100);
  if (!who) throw new TypeError("Enter the escalation reviewer.");
  if (!ESCALATION_DECISIONS.includes(decision)) throw new TypeError("Choose escalate, defer, or dismiss.");
  if (!why) throw new TypeError("Record the rationale for the escalation decision.");
  if (!at || !policy) throw new TypeError("Enter a valid decision timestamp and policy ID.");
  const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(text(nextReviewDate, 10)) ? text(nextReviewDate, 10) : "";
  if (decision === "defer" && (!reviewDate || Number.isNaN(Date.parse(`${reviewDate}T00:00:00Z`)) || reviewDate < at.slice(0, 10))) throw new TypeError("A deferred escalation requires a valid next-review date on or after the decision date.");
  const decisionId = text(id || `escalation-decision-${Date.parse(at) || 0}-${action.id}-${policy}`, 180);
  const priorDecisions = notes.flatMap((entry) => entry.escalationDecisions);
  if (priorDecisions.some((entry) => entry.id === decisionId)) throw new TypeError("An escalation decision with this ID already exists.");
  const supersedesId = text(supersedesDecisionId, 180);
  if (supersedesId && !priorDecisions.some((entry) => entry.id === supersedesId && entry.actionId === action.id)) throw new TypeError("The superseded decision must exist for the same action.");
  if (!supersedesId && priorDecisions.some((entry) => entry.actionId === action.id && entry.policyId === policy && entry.decision === decision && entry.rationale === why)) throw new TypeError("A matching escalation decision already exists for this action and policy.");
  const entry = normalizeEscalationDecision({ id: decisionId, actionId: action.id, taskId: action.taskId, policyId: policy, decision, reviewer: who, rationale: why, decidedAt: at, nextReviewDate: reviewDate, supersedesDecisionId: supersedesId });
  const updatedNote = { ...note, escalationDecisions: [...note.escalationDecisions, entry].slice(-100) };
  const nextNotes = notes.map((item) => item.id === note.id ? updatedNote : item);
  return { notes: normalizeRemediationHandoffNotes(nextNotes), note: normalizeRemediationHandoffNotes([updatedNote])[0], decision: entry, changed: true };
}


/** Build a read-only queue of deferred decisions requiring a scheduled human review. */
export function buildRemediationHandoffEscalationReviewQueue(noteValues, { asOfDate = new Date().toISOString().slice(0, 10), windowDays = 3, currentPolicyId = "" } = {}) {
  const date = text(asOfDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new TypeError("Enter a valid escalation review queue date.");
  if (!Number.isSafeInteger(windowDays) || windowDays < 0 || windowDays > 90) throw new TypeError("Review window must be between 0 and 90 days.");
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const decisions = notes.flatMap((note) => note.escalationDecisions.map((decision) => ({ ...decision, handoffNoteId: note.id, note })));
  const supersededIds = new Set(decisions.map((item) => item.supersedesDecisionId).filter(Boolean));
  const endDate = new Date(Date.parse(`${date}T00:00:00Z`) + windowDays * 86400000).toISOString().slice(0, 10);
  const items = decisions.filter((item) => item.decision === "defer" && item.nextReviewDate).map((item) => {
    const superseded = supersededIds.has(item.id);
    const action = item.note.followUpActions.find((entry) => entry.id === item.actionId);
    const policyChanged = Boolean(text(currentPolicyId, 100) && currentPolicyId !== item.policyId);
    const status = superseded ? "superseded" : item.nextReviewDate < date ? "overdue" : item.nextReviewDate === date ? "due" : item.nextReviewDate <= endDate ? "upcoming" : "scheduled";
    return { decisionId: item.id, actionId: item.actionId, taskId: item.taskId, handoffNoteId: item.handoffNoteId, reviewer: item.reviewer, decision: item.decision, policyId: item.policyId, currentPolicyId: text(currentPolicyId, 100), policyChanged, nextReviewDate: item.nextReviewDate, status, actionStatus: action?.status || "missing", actionExists: Boolean(action), rationale: item.rationale, reviewHistoryCount: item.reviewHistory.length, requiresHumanDecision: true, classification: "derived-escalation-review-queue-item" };
  }).sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate) || a.decisionId.localeCompare(b.decisionId));
  return { asOfDate: date, windowDays, totalCount: items.length, overdueCount: items.filter((item) => item.status === "overdue").length, dueCount: items.filter((item) => item.status === "due").length, upcomingCount: items.filter((item) => item.status === "upcoming").length, policyChangedCount: items.filter((item) => item.policyChanged && item.status !== "superseded").length, items, classification: "derived-escalation-review-queue", disclaimer: "Queue entries are reminders for human review, not notifications or proof of delivery. They do not alter actions, canonical findings, or rollout blockers." };
}

/** Record a review against the original decision and optionally append a linked replacement decision. */
export function recordRemediationHandoffEscalationReview(noteValues, noteId, decisionId, { reviewer, outcome, rationale, nextReviewDate = "", currentPolicyId = "" } = {}, { reviewedAt = new Date().toISOString(), id } = {}) {
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const note = notes.find((entry) => entry.id === text(noteId, 160));
  if (!note) throw new TypeError("Select the handoff note that owns the deferred decision.");
  const source = note.escalationDecisions.find((entry) => entry.id === text(decisionId, 180));
  if (!source || source.decision !== "defer") throw new TypeError("Select an existing deferred escalation decision to review.");
  const allDecisions = notes.flatMap((entry) => entry.escalationDecisions);
  if (allDecisions.some((entry) => entry.supersedesDecisionId === source.id)) throw new TypeError("This decision has already been superseded; review the latest linked decision instead.");
  const who = text(reviewer, 120), why = text(rationale, 1200), at = validTimestamp(reviewedAt), policy = text(currentPolicyId || source.policyId, 100);
  if (!who || !why || !at || !policy) throw new TypeError("Enter reviewer, rationale, valid review timestamp, and current policy ID.");
  if (!["reaffirm", "escalate", "defer", "dismiss"].includes(outcome)) throw new TypeError("Choose reaffirm, escalate, defer, or dismiss as the review outcome.");
  const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(text(nextReviewDate, 10)) ? text(nextReviewDate, 10) : "";
  if (outcome === "defer" && (!reviewDate || Number.isNaN(Date.parse(`${reviewDate}T00:00:00Z`)) || reviewDate < at.slice(0, 10))) throw new TypeError("A deferred review outcome requires a valid next-review date on or after the review date.");
  const review = { id: text(id || `escalation-review-${Date.parse(at) || 0}-${source.id}`, 180), reviewer: who, outcome, rationale: why, reviewedAt: at, nextReviewDate: reviewDate, evaluatedPolicyId: policy, policyChanged: policy !== source.policyId, classification: "manual-escalation-follow-up-review", independentlyVerified: false };
  if (!review.id || source.reviewHistory.some((entry) => entry.id === review.id)) throw new TypeError("An escalation review with this ID already exists.");
  const updatedSource = normalizeEscalationDecision({ ...source, reviewHistory: [...source.reviewHistory, review] });
  let nextDecisions = note.escalationDecisions.map((entry) => entry.id === source.id ? updatedSource : entry);
  let replacement = null;
  if (["escalate", "defer", "dismiss"].includes(outcome)) {
    const action = note.followUpActions.find((entry) => entry.id === source.actionId);
    if (!action) throw new TypeError("The source follow-up action no longer exists; preserve the review and resolve the missing action manually.");
    replacement = normalizeEscalationDecision({ id: `${review.id}-decision`, actionId: source.actionId, taskId: source.taskId, policyId: policy, decision: outcome, reviewer: who, rationale: why, decidedAt: at, nextReviewDate: outcome === "defer" ? reviewDate : "", supersedesDecisionId: source.id });
    if (!replacement) throw new TypeError("Could not validate the replacement escalation decision.");
    nextDecisions = [...nextDecisions, replacement].slice(-100);
  }
  const updatedNote = { ...note, escalationDecisions: nextDecisions };
  const nextNotes = normalizeRemediationHandoffNotes(notes.map((entry) => entry.id === note.id ? updatedNote : entry));
  const resultNote = nextNotes.find((entry) => entry.id === note.id);
  return { notes: nextNotes, note: resultNote, sourceDecision: resultNote.escalationDecisions.find((entry) => entry.id === source.id), review, replacementDecision: replacement, changed: true };
}

export function normalizeRemediationHandoffNotes(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const [index, raw] of value.entries()) {
    if (!isRecord(raw)) continue;
    const author = text(raw.author, 120);
    const note = text(raw.note, 1800);
    const createdAt = validTimestamp(raw.createdAt);
    if (!author || !note || !createdAt) continue;
    const id = text(raw.id || `handoff-note-${Date.parse(createdAt) || 0}-${index + 1}`, 160);
    if (!id) continue;
    const summarySnapshot = isRecord(raw.summarySnapshot) ? {
      asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.summarySnapshot.asOfDate, 10)) ? text(raw.summarySnapshot.asOfDate, 10) : "",
      activeTaskCount: nonNegativeInteger(raw.summarySnapshot.activeTaskCount),
      resolvedTaskCount: nonNegativeInteger(raw.summarySnapshot.resolvedTaskCount),
      openRolloutBlockerCount: nonNegativeInteger(raw.summarySnapshot.openRolloutBlockerCount),
      counts: Object.fromEntries(CATEGORY_KEYS.map((key) => [key, nonNegativeInteger(raw.summarySnapshot.counts?.[key])])),
      references: Object.fromEntries(CATEGORY_KEYS.map((key) => [key, safeArray(raw.summarySnapshot.references?.[key]).slice(0, 8).filter(isRecord).map((item) => ({
        id: text(item.id, 1000), recordId: text(item.recordId, 140), recordTitle: text(item.recordTitle, 180),
        findingId: text(item.findingId, 140), findingCode: text(item.findingCode, 100), findingTitle: text(item.findingTitle, 240), kind: text(item.kind, 80),
        severity: ["error", "warning", "info"].includes(item.severity) ? item.severity : "info",
        assignee: text(item.assignee, 120), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(text(item.dueDate, 10)) ? text(item.dueDate, 10) : "",
        blocksRollout: item.blocksRollout === true, findingStatus: text(item.findingStatus, 40),
      })).filter((item) => item.id)])),
      classification: "point-in-time-derived-work-queue-summary",
    } : null;
    byId.set(id, {
      id,
      author,
      handedTo: text(raw.handedTo, 120),
      note,
      createdAt,
      summarySnapshot,
      receipt: normalizeRemediationHandoffReceipt(raw.receipt),
      followUpActions: safeArray(raw.followUpActions).map(normalizeHandoffAction).filter(Boolean).slice(-200),
      escalationDecisions: safeArray(raw.escalationDecisions).map(normalizeEscalationDecision).filter(Boolean).slice(-100),
      classification: "manual-handoff-note",
      independentlyVerified: false,
    });
  }
  return [...byId.values()].slice(-MAX_HANDOFF_NOTES);
}


const RECEIPT_STATUSES = Object.freeze(["received", "received-with-follow-up", "not-received"]);

/** Normalize a manually recorded receipt without treating it as proof of external delivery. */
export function normalizeRemediationHandoffReceipt(value) {
  if (!isRecord(value)) return null;
  const reviewer = text(value.reviewer, 120);
  const status = RECEIPT_STATUSES.includes(value.status) ? value.status : "";
  const recordedAt = validTimestamp(value.recordedAt);
  if (!reviewer || !status || !recordedAt) return null;
  return {
    reviewer, status, recordedAt, note: text(value.note, 1200),
    classification: "manual-handoff-receipt-attestation", independentlyVerified: false,
  };
}

/** Record receipt metadata while retaining the handoff note and original snapshot unchanged. */
export function recordRemediationHandoffReceipt(notesValue, noteId, { reviewer, status, note = "" } = {}, { recordedAt = new Date().toISOString() } = {}) {
  const normalizedReviewer = text(reviewer, 120);
  const normalizedStatus = RECEIPT_STATUSES.includes(status) ? status : "";
  const at = validTimestamp(recordedAt);
  if (!normalizedReviewer) throw new TypeError("Enter a reviewer for the handoff receipt.");
  if (!normalizedStatus) throw new TypeError("Choose a valid handoff receipt status.");
  if (!at) throw new TypeError("Enter a valid handoff receipt timestamp.");
  const normalized = normalizeRemediationHandoffNotes(notesValue);
  const target = normalized.find((entry) => entry.id === text(noteId, 160));
  if (!target) throw new TypeError("Select an existing handoff note before recording its receipt.");
  const receipt = { reviewer: normalizedReviewer, status: normalizedStatus, recordedAt: at, note: text(note, 1200), classification: "manual-handoff-receipt-attestation", independentlyVerified: false };
  const next = normalized.map((entry) => entry.id === target.id ? { ...entry, receipt } : entry);
  return { notes: next, note: next.find((entry) => entry.id === target.id), changed: true };
}

/** Compare bounded snapshot references with the live queue and identify follow-up candidates. */
export function reconcileRemediationHandoff(noteValue, queueValue) {
  const note = normalizeRemediationHandoffNotes([noteValue])[0];
  const snapshot = note?.summarySnapshot;
  const queue = isRecord(queueValue) ? queueValue : {};
  const liveById = new Map(safeArray(queue.items).map((item) => [text(item?.id, 1000), item]));
  const carryForward = [], unchanged = [], seen = new Set(), categories = {};
  for (const key of CATEGORY_KEYS) {
    const refs = safeArray(snapshot?.references?.[key]);
    categories[key] = { snapshotCount: nonNegativeInteger(snapshot?.counts?.[key]), referencesCompared: refs.length, changedCount: 0 };
    for (const ref of refs) {
      const identity = `${key}:${ref.id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const live = liveById.get(ref.id);
      let reason = "";
      if (!live) reason = "Task is no longer present in the live queue; confirm whether it was removed or its source finding changed.";
      else {
        const liveStatus = text(live.findingStatus, 40), liveDue = text(live.dueDate, 10), liveAssignee = text(live.assignee, 120), liveKind = text(live.kind, 80);
        if (live.status === "resolved" || live.isResolved === true || live.lifecycleStatus === "resolved") reason = "Task is now resolved; confirm the underlying finding disposition independently.";
        else if (liveStatus !== text(ref.findingStatus, 40)) reason = `Underlying finding status changed from ${text(ref.findingStatus, 40) || "unknown"} to ${liveStatus || "unknown"}.`;
        else if (liveDue !== text(ref.dueDate, 10)) reason = `Due date changed from ${text(ref.dueDate, 10) || "unset"} to ${liveDue || "unset"}.`;
        else if (liveAssignee !== text(ref.assignee, 120)) reason = `Assignee changed from ${text(ref.assignee, 120) || "unassigned"} to ${liveAssignee || "unassigned"}.`;
        else if (liveKind !== text(ref.kind, 80)) reason = `Task category changed from ${text(ref.kind, 80) || "unknown"} to ${liveKind || "unknown"}.`;
      }
      const entry = { category: key, taskId: ref.id, findingCode: ref.findingCode, findingTitle: ref.findingTitle, recordId: ref.recordId, recordTitle: ref.recordTitle, severity: ref.severity, blocksRollout: ref.blocksRollout, reason };
      if (reason) { carryForward.push(entry); categories[key].changedCount += 1; } else unchanged.push(entry);
    }
  }
  return { handoffNoteId: note?.id || "", snapshotAsOfDate: snapshot?.asOfDate || "", evaluatedDate: text(queue.evaluatedDate, 10), comparedAt: new Date().toISOString(), comparedReferenceCount: unchanged.length + carryForward.length, unchangedCount: unchanged.length, carryForwardCount: carryForward.length, categories, carryForward, unchanged, classification: "derived-handoff-follow-up-reconciliation", disclaimer: "Snapshot references are bounded previews, not the complete historical queue. Changes identify follow-up candidates only; they do not prove delivery, acceptance, or evidence verification." };
}

/** Save a handoff note and a bounded snapshot of the queue state it describes. */
export function appendRemediationHandoffNote(notesValue, { author, handedTo = "", note, handoffSummary } = {}, { createdAt = new Date().toISOString(), id } = {}) {
  const normalizedAuthor = text(author, 120);
  const normalizedNote = text(note, 1800);
  const at = validTimestamp(createdAt, new Date().toISOString());
  if (!normalizedAuthor) throw new TypeError("Enter an author for the handoff note.");
  if (!normalizedNote) throw new TypeError("Enter handoff notes before saving.");
  const noteId = text(id || `handoff-note-${Date.parse(at) || 0}-${Math.random().toString(36).slice(2, 10)}`, 160);
  const entry = {
    id: noteId,
    author: normalizedAuthor,
    handedTo: text(handedTo, 120),
    note: normalizedNote,
    createdAt: at,
    summarySnapshot: summarySnapshotFromQueueSummary(handoffSummary),
    classification: "manual-handoff-note",
    independentlyVerified: false,
  };
  const nextNotes = [...normalizeRemediationHandoffNotes(notesValue), entry].slice(-MAX_HANDOFF_NOTES);
  return { notes: nextNotes, note: normalizeRemediationHandoffNotes([entry])[0], changed: true };
}

function taskLine(item) {
  const components = [
    `**${item.findingTitle || "Untitled finding"}**`,
    item.recordTitle || item.recordId,
    item.kindLabel || item.kind,
    item.assignee || "Unassigned",
    item.dueDate ? `due ${item.dueDate}` : "no due date",
  ].filter(Boolean);
  if (item.blocksRollout) components.push("ROLL OUT BLOCKER");
  if (item.findingStatus === "open") components.push("underlying finding OPEN");
  if (item.isEscalationAcknowledged) components.push("escalation acknowledged");
  if (item.reason) components.push(item.reason);
  return `- ${components.join(" · ")} (task \`${item.id}\`)`;
}


const HANDOFF_DASHBOARD_FILTERS = Object.freeze(["all", "open", "overdue", "rejected-closure", "awaiting-review"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build an accountability view from saved handoff action metadata.
 * Aging and escalation recommendations are derived views, not automatic notifications.
 */
export function buildRemediationHandoffAccountabilityDashboard(noteValues, {
  asOfDate = new Date().toISOString().slice(0, 10),
  agingThresholdDays = 7,
  filter = "all",
  owner = "",
} = {}) {
  const date = text(asOfDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new TypeError("Enter a valid dashboard evaluation date.");
  }
  if (!Number.isSafeInteger(agingThresholdDays) || agingThresholdDays < 1 || agingThresholdDays > 365) {
    throw new TypeError("Aging threshold must be between 1 and 365 days.");
  }
  if (!HANDOFF_DASHBOARD_FILTERS.includes(filter)) throw new TypeError("Choose a supported accountability filter.");
  const normalizedOwner = text(owner, 120);
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const allActions = notes.flatMap((note) => note.followUpActions.map((action) => ({ ...action, handoffNoteId: note.id, handoffAuthor: note.author, handedTo: note.handedTo })));
  const today = Date.parse(`${date}T00:00:00Z`);
  const actions = allActions.map((action) => {
    const due = Date.parse(`${action.dueDate}T00:00:00Z`);
    const created = Date.parse(action.createdAt || action.updatedAt || `${date}T00:00:00Z`);
    const overdueDays = action.status === "closed" || due >= today ? 0 : Math.floor((today - due) / DAY_MS);
    const ageDays = Math.max(0, Math.floor((today - created) / DAY_MS));
    const missedDueDateEvents = action.history.filter((event) => event.snapshot?.status !== "closed" && event.snapshot?.dueDate && event.snapshot.dueDate < date && event.at.slice(0, 10) > event.snapshot.dueDate).length;
    const reassignments = [];
    let priorOwner = "";
    for (const event of action.history) {
      const currentOwner = text(event.snapshot?.owner, 120);
      if (priorOwner && currentOwner && currentOwner !== priorOwner) {
        reassignments.push({ at: event.at, actor: event.actor, from: priorOwner, to: currentOwner });
      }
      if (currentOwner) priorOwner = currentOwner;
    }
    const latestReview = action.closureReviews.at(-1) || null;
    const awaitingReview = action.status === "closed" && (!latestReview || latestReview.decision === "rejected");
    const escalation = action.status !== "closed" && (overdueDays > 0 || ageDays >= agingThresholdDays)
      ? { recommended: true, reason: overdueDays > 0 ? `Overdue by ${overdueDays} day(s).` : `Open for ${ageDays} day(s), meeting the ${agingThresholdDays}-day aging threshold.`, requiresHumanDecision: true }
      : { recommended: false, reason: "", requiresHumanDecision: true };
    return { ...action, overdueDays, ageDays, missedDueDateEventCount: missedDueDateEvents, reassignments, latestReview, awaitingReview, escalation };
  });
  const filtered = actions.filter((action) => {
    if (normalizedOwner && action.owner !== normalizedOwner) return false;
    if (filter === "open" && action.status !== "open" && action.status !== "in-progress") return false;
    if (filter === "overdue" && action.overdueDays <= 0) return false;
    if (filter === "rejected-closure" && !action.closureReviews.some((review) => review.decision === "rejected")) return false;
    if (filter === "awaiting-review" && !action.awaitingReview) return false;
    return true;
  });
  const ownerGroups = {};
  for (const action of filtered) {
    const key = action.owner || "Unassigned";
    if (!ownerGroups[key]) ownerGroups[key] = { owner: key, total: 0, open: 0, overdue: 0, awaitingReview: 0, recommendedEscalations: 0, actions: [] };
    const group = ownerGroups[key];
    group.total += 1;
    if (action.status !== "closed") group.open += 1;
    if (action.overdueDays > 0) group.overdue += 1;
    if (action.awaitingReview) group.awaitingReview += 1;
    if (action.escalation.recommended) group.recommendedEscalations += 1;
    group.actions.push({ id: action.id, taskId: action.taskId, status: action.status, dueDate: action.dueDate, overdueDays: action.overdueDays, ageDays: action.ageDays, escalation: action.escalation });
  }
  const missedDueDates = filtered.flatMap((action) => action.history.filter((event) => event.snapshot?.status !== "closed" && event.snapshot?.dueDate && event.snapshot.dueDate < date && event.at.slice(0, 10) > event.snapshot.dueDate).map((event) => ({
    actionId: action.id, taskId: action.taskId, owner: action.owner, dueDate: event.snapshot.dueDate, recordedAt: event.at, actor: event.actor,
  })));
  const reassignmentHistory = filtered.flatMap((action) => action.reassignments.map((event) => ({ actionId: action.id, taskId: action.taskId, ...event })));
  return {
    asOfDate: date, agingThresholdDays, filter, owner: normalizedOwner,
    totalActionCount: filtered.length,
    openCount: filtered.filter((action) => action.status !== "closed").length,
    overdueCount: filtered.filter((action) => action.overdueDays > 0).length,
    rejectedClosureCount: filtered.filter((action) => action.closureReviews.some((review) => review.decision === "rejected")).length,
    awaitingReviewCount: filtered.filter((action) => action.awaitingReview).length,
    recommendedEscalationCount: filtered.filter((action) => action.escalation.recommended).length,
    ownerGroups: Object.values(ownerGroups).sort((a, b) => a.owner.localeCompare(b.owner)),
    actions: filtered.sort((a, b) => (b.overdueDays - a.overdueDays) || (b.ageDays - a.ageDays) || a.dueDate.localeCompare(b.dueDate)),
    missedDueDates, reassignmentHistory,
    classification: "derived-manual-handoff-accountability-dashboard",
    disclaimer: "Aging and escalation flags are recommendations for human review, not automatic notifications or proof of negligence. Dates and ownership are user-entered metadata. Closing a handoff action does not close its underlying remediation task or canonical finding.",
  };
}

/** Format a portable, document-wide escalation review and shift-handoff Markdown artifact. */
export function formatRemediationHandoffMarkdown({ queue, decisionRecords = [], generatedAt = new Date().toISOString() } = {}) {
  const summary = normalizeRemediationHandoffSummary(queue?.handoffSummary);
  const records = safeArray(decisionRecords).filter(isRecord).slice(-50);
  const notes = records.flatMap((record) => normalizeRemediationHandoffNotes(record.handoffNotes).map((entry) => ({
    ...entry,
    recordId: text(record.id, 120),
    recordTitle: text(record.title || record.id || "Decision record", 180),
  }))).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-MAX_HANDOFF_REPORT_NOTES);
  const lines = [
    "# Sketchizi Escalation Review & Handoff",
    "",
    `- **Generated:** ${validTimestamp(generatedAt, new Date().toISOString())}`,
    `- **Evaluation date:** ${summary?.asOfDate || queue?.evaluatedDate || "Unavailable"}`,
    `- **Decision records in scope:** ${records.length}`,
    "",
    "## Current queue summary",
    "",
    `- **Active tasks:** ${summary?.activeTaskCount ?? queue?.totalCount ?? 0}`,
    `- **Resolved queue tasks:** ${summary?.resolvedTaskCount ?? queue?.totalResolvedCount ?? 0}`,
    `- **Open rollout-blocking error tasks:** ${summary?.openRolloutBlockerCount ?? queue?.blockingCount ?? 0}`,
    `- **Acknowledged overdue blockers:** ${summary?.acknowledgedBlockers.count ?? 0}`,
    `- **Unresolved follow-ups (not overdue):** ${summary?.unresolvedFollowUps.count ?? 0}`,
    `- **Overdue active tasks:** ${summary?.overdueTasks.count ?? queue?.overdueCount ?? 0}`,
    `- **Resolved tasks with open findings:** ${summary?.resolvedTasksWithOpenFindings.count ?? queue?.resolvedOpenBlockerCount ?? 0}`,
    `- **Resolved tasks with open error findings that still block rollout:** ${summary?.resolvedTasksWithOpenFindings.items.filter((item) => item.blocksRollout && item.findingStatus === "open").length ?? 0}${summary?.resolvedTasksWithOpenFindings.truncated ? " (preview is truncated; count above is the category total)" : ""}`,
    "",
  ];

  for (const key of CATEGORY_KEYS) {
    const category = summary?.[key] || { count: 0, items: [], truncated: false };
    lines.push(`## ${CATEGORY_LABELS[key]}`, "", `**Total:** ${category.count}.`);
    lines.push(...(category.items.length ? category.items.map(taskLine) : ["No tasks in this category at export time."]));
    if (category.truncated) lines.push(`Showing ${category.items.length} item(s); the category contains ${category.count} item(s).`);
    lines.push("");
  }

  lines.push("## Handoff notes", "");
  if (notes.length) {
    for (const entry of notes) {
      lines.push(`### ${entry.createdAt} — ${entry.recordTitle}`, "", `- **Author:** ${entry.author}`, `- **Handed to:** ${entry.handedTo || "Not specified"}`, `- **Decision record:** ${entry.recordId}`, "", entry.note, "");
      if (entry.receipt) {
        lines.push("**Manual receipt attestation**", "", `- Reviewer: ${entry.receipt.reviewer}`, `- Status: ${entry.receipt.status}`, `- Recorded: ${entry.receipt.recordedAt}`);
        if (entry.receipt.note) lines.push(`- Note: ${entry.receipt.note}`);
        lines.push("- This is a manual attestation, not proof of external delivery.", "");
      }
      if (entry.followUpActions?.length) {
        lines.push("**Carry-forward action ledger**", "");
        for (const action of entry.followUpActions) {
          lines.push(`- **${action.status.toUpperCase()}** ${action.findingTitle || action.taskId} — owner: ${action.owner}; due: ${action.dueDate}`, `  - Closure criteria: ${action.closureCriteria}`);
          if (action.closureEvidence) lines.push(`  - Closure evidence: ${action.closureEvidence}`);
          for (const review of action.closureReviews || []) lines.push(`  - Closure review: ${review.decision.toUpperCase()} by ${review.reviewer} at ${review.reviewedAt} — ${review.rationale} (manual review; not independent verification)`);
          if (action.parentActionId) lines.push(`  - Reopened from closed action: ${action.parentActionId}`);
          lines.push(`  - History entries: ${action.history.length}; manual workflow metadata, not independent verification.`);
        }
        lines.push("");
      }
      if (entry.escalationDecisions?.length) {
        lines.push("**Escalation policy decisions**", "");
        for (const decision of entry.escalationDecisions) {
          lines.push(`- **${decision.decision.toUpperCase()}** action ${decision.actionId} — policy ${decision.policyId}; reviewer ${decision.reviewer}; recorded ${decision.decidedAt}${decision.nextReviewDate ? `; next review: ${decision.nextReviewDate}` : ""}${decision.supersedesDecisionId ? `; supersedes ${decision.supersedesDecisionId}` : ""}`, `  - Rationale: ${decision.rationale}`);
          for (const review of decision.reviewHistory) lines.push(`  - Review **${review.outcome.toUpperCase()}** by ${review.reviewer} at ${review.reviewedAt}; evaluated policy ${review.evaluatedPolicyId}${review.policyChanged ? " (policy changed)" : ""}${review.nextReviewDate ? `; next review: ${review.nextReviewDate}` : ""}. Rationale: ${review.rationale}`);
          lines.push("  - Manual decision metadata; no notification or canonical finding change is implied.");
        }
        lines.push("");
      }
      if (entry.summarySnapshot) {
        const snapshot = entry.summarySnapshot;
        lines.push("**Queue snapshot when this note was recorded**", "", `- As of: ${snapshot.asOfDate || "Unavailable"}`, `- Active tasks: ${snapshot.activeTaskCount}`, `- Resolved tasks: ${snapshot.resolvedTaskCount}`, `- Open rollout blockers: ${snapshot.openRolloutBlockerCount}`);
        for (const key of CATEGORY_KEYS) lines.push(`- ${CATEGORY_LABELS[key]}: ${snapshot.counts[key]}`);
        lines.push("");
      }
    }
    if (notes.length === MAX_HANDOFF_REPORT_NOTES) lines.push("Only the 100 most recent handoff notes are included in this export.", "");
  } else {
    lines.push("No handoff notes have been recorded yet.", "");
  }

  lines.push(
    "## Interpretation and limitations",
    "",
    "This handoff is a point-in-time summary of derived queue tasks and manually recorded handoff notes. Acknowledged escalation means a reviewer recorded an acknowledgement; it does not establish that a recipient was contacted. Resolving a queue task does not change the canonical finding disposition, supersede original evidence, or clear a still-open error finding from rollout readiness. This export does not authenticate evidence or approve deployment.",
    "",
  );
  return lines.join("\n");
}


/** Export an accountability dashboard as portable Markdown. */
export function formatRemediationHandoffAccountabilityMarkdown(dashboardValue, { generatedAt = new Date().toISOString() } = {}) {
  const dashboard = isRecord(dashboardValue) ? dashboardValue : {};
  const lines = [
    "# Sketchizi Handoff Accountability",
    "",
    `- **Generated:** ${validTimestamp(generatedAt, new Date().toISOString())}`,
    `- **As of:** ${text(dashboard.asOfDate, 10) || "Unavailable"}`,
    `- **Aging threshold:** ${nonNegativeInteger(dashboard.agingThresholdDays)} day(s)`,
    `- **Actions in scope:** ${nonNegativeInteger(dashboard.totalActionCount)}`,
    `- **Open:** ${nonNegativeInteger(dashboard.openCount)}`,
    `- **Overdue:** ${nonNegativeInteger(dashboard.overdueCount)}`,
    `- **Rejected closure:** ${nonNegativeInteger(dashboard.rejectedClosureCount)}`,
    `- **Awaiting review:** ${nonNegativeInteger(dashboard.awaitingReviewCount)}`,
    `- **Escalation recommendations:** ${nonNegativeInteger(dashboard.recommendedEscalationCount)}`,
    "",
    "## Owner summary",
    "",
  ];
  for (const group of safeArray(dashboard.ownerGroups)) {
    lines.push(`- **${text(group.owner, 120)}:** ${nonNegativeInteger(group.open)} open; ${nonNegativeInteger(group.overdue)} overdue; ${nonNegativeInteger(group.awaitingReview)} awaiting review; ${nonNegativeInteger(group.recommendedEscalations)} escalation recommendation(s).`);
  }
  if (!safeArray(dashboard.ownerGroups).length) lines.push("No actions match this dashboard filter.");
  lines.push("", "## Follow-up actions", "");
  for (const action of safeArray(dashboard.actions)) {
    lines.push(`### ${text(action.findingTitle || action.taskId, 240)}`, "", `- Action: \`${text(action.id, 180)}\``, `- Task: \`${text(action.taskId, 1000)}\``, `- Owner: ${text(action.owner, 120)}`, `- Due: ${text(action.dueDate, 10)}${action.overdueDays ? ` (${action.overdueDays} day(s) overdue)` : ""}`, `- Status: ${text(action.status, 40)}`, `- Closure criteria: ${text(action.closureCriteria, 1200)}`);
    if (action.escalation?.recommended) lines.push(`- Escalation recommendation: ${text(action.escalation.reason, 240)} Human decision required.`);
    if (action.latestReview) lines.push(`- Latest closure review: ${action.latestReview.decision} by ${action.latestReview.reviewer} — ${action.latestReview.rationale}`);
    lines.push("");
  }
  lines.push("## Missed due dates", "");
  for (const event of safeArray(dashboard.missedDueDates)) lines.push(`- ${event.taskId}: due ${event.dueDate}; recorded ${event.recordedAt} by ${event.actor}.`);
  if (!safeArray(dashboard.missedDueDates).length) lines.push("No missed due-date events were identified from retained history.");
  lines.push("", "## Reassignments", "");
  for (const event of safeArray(dashboard.reassignmentHistory)) lines.push(`- ${event.taskId}: ${event.from} → ${event.to}, recorded ${event.at} by ${event.actor}.`);
  if (!safeArray(dashboard.reassignmentHistory).length) lines.push("No reassignment events were identified from retained history.");
  lines.push("", "## Interpretation limits", "", text(dashboard.disclaimer || "Derived manual workflow metadata; review before taking action."), "");
  return lines.join("\n");
}

/** Derive review SLA metrics from retained handoff decisions; values are historical estimates, not telemetry. */
export function buildRemediationHandoffEscalationSlaMetrics(noteValues, {
  asOfDate = new Date().toISOString().slice(0, 10), reviewSlaDays = 3,
} = {}) {
  const date = text(asOfDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new TypeError("Enter a valid SLA metrics date.");
  if (!Number.isSafeInteger(reviewSlaDays) || reviewSlaDays < 1 || reviewSlaDays > 365) throw new TypeError("Review SLA must be between 1 and 365 days.");
  const notes = normalizeRemediationHandoffNotes(noteValues);
  const decisions = notes.flatMap((note) => note.escalationDecisions.map((decision) => ({ ...decision, handoffNoteId: note.id })));
  const supersededIds = new Set(decisions.map((decision) => decision.supersedesDecisionId).filter(Boolean));
  const active = decisions.filter((decision) => !supersededIds.has(decision.id));
  const deferred = active.filter((decision) => decision.decision === "defer" && decision.nextReviewDate);
  const due = deferred.filter((decision) => decision.nextReviewDate <= date);
  const overdue = deferred.filter((decision) => decision.nextReviewDate < date);
  const reviewed = decisions.flatMap((decision) => decision.reviewHistory.map((review) => ({ decision, review })));
  const latencies = reviewed.map(({ decision, review }) => Math.max(0, Math.floor((Date.parse(review.reviewedAt) - Date.parse(decision.decidedAt)) / 86400000)));
  const withinSla = latencies.filter((days) => days <= reviewSlaDays).length;
  const outcomeCounts = { reaffirm: 0, escalate: 0, defer: 0, dismiss: 0 };
  for (const { review } of reviewed) outcomeCounts[review.outcome] = (outcomeCounts[review.outcome] || 0) + 1;
  return {
    asOfDate: date, reviewSlaDays,
    counts: { retainedDecisions: decisions.length, activeDecisions: active.length, deferredActive: deferred.length, reviewsRecorded: reviewed.length, dueReviews: due.length, overdueReviews: overdue.length, reviewedDecisions: new Set(reviewed.map(({ decision }) => decision.id)).size },
    reviewLatency: { sampleCount: latencies.length, averageDays: latencies.length ? Number((latencies.reduce((sum, days) => sum + days, 0) / latencies.length).toFixed(2)) : null, maxDays: latencies.length ? Math.max(...latencies) : null, withinSlaCount: withinSla, withinSlaRate: latencies.length ? Number((withinSla / latencies.length).toFixed(4)) : null },
    outcomeCounts,
    overdueRate: deferred.length ? Number((overdue.length / deferred.length).toFixed(4)) : null,
    overdueDecisionIds: overdue.map((decision) => decision.id),
    classification: "derived-handoff-escalation-sla-metrics",
    disclaimer: "Metrics are derived only from retained handoff decision and review records. They are not independent operational telemetry, delivery receipts, or proof that a reviewer was notified. Missing review records are not assumed to be completed.",
  };
}

/** Compare policy candidates without mutating the notes, actions, findings, or rollout gates. */
export function simulateRemediationHandoffEscalationPolicy(noteValues, { baselinePolicy, proposedPolicy } = {}) {
  if (!isRecord(baselinePolicy) || !isRecord(proposedPolicy)) throw new TypeError("Provide baselinePolicy and proposedPolicy configurations.");
  const baseline = evaluateRemediationHandoffEscalationPolicy(noteValues, baselinePolicy);
  const proposed = evaluateRemediationHandoffEscalationPolicy(noteValues, proposedPolicy);
  const baselineById = new Map(baseline.candidates.map((candidate) => [candidate.actionId, candidate]));
  const proposedById = new Map(proposed.candidates.map((candidate) => [candidate.actionId, candidate]));
  const newlyEligible = proposed.candidates.filter((candidate) => !baselineById.has(candidate.actionId));
  const noLongerEligible = baseline.candidates.filter((candidate) => !proposedById.has(candidate.actionId));
  const unchanged = proposed.candidates.filter((candidate) => baselineById.has(candidate.actionId)).map((candidate) => candidate.actionId);
  return {
    baseline: { policy: baseline.policy, candidateCount: baseline.candidateCount, duplicateDecisionCount: baseline.duplicateDecisionCount },
    proposed: { policy: proposed.policy, candidateCount: proposed.candidateCount, duplicateDecisionCount: proposed.duplicateDecisionCount },
    delta: { candidateCount: proposed.candidateCount - baseline.candidateCount, duplicateDecisionCount: proposed.duplicateDecisionCount - baseline.duplicateDecisionCount, newlyEligible, noLongerEligible, unchangedActionIds: unchanged },
    classification: "what-if-escalation-policy-simulation",
    disclaimer: "This is a deterministic what-if comparison over retained handoff data, not a forecast of real-world outcomes. It does not apply the proposed policy, record decisions, notify reviewers, change remediation actions, or clear rollout blockers.",
  };
}
