const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, limit = 240) => String(value ?? "").trim().slice(0, limit);
const safeArray = (value) => Array.isArray(value) ? value : [];
const MAX_TASKS_PER_RECORD = 300;
const MAX_TASK_AUDIT_EVENTS = 30;
const MAX_TASK_FOLLOW_UP_NOTES = 30;
const MAX_TASK_RESOLUTION_HISTORY = 10;

function normalizeDateOnly(value) {
  const date = text(value, 30);
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError("Due dates must use YYYY-MM-DD format.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new TypeError("Enter a valid calendar date for the task due date.");
  }
  return date;
}

function safeTimestamp(value, fallback = new Date().toISOString()) {
  const candidate = typeof value === "string" ? value : "";
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : fallback;
}

function normalizeAuditEvent(event, index) {
  if (!isRecord(event)) return null;
  const changes = safeArray(event.changes).slice(0, 4).map((change) => {
    if (!isRecord(change)) return null;
    const field = ["assignee", "dueDate", "escalationAcknowledgement", "taskResolution", "followUpNote"].includes(change.field) ? change.field : "";
    if (!field) return null;
    return {
      field,
      from: text(change.from, field === "assignee" ? 120 : field === "dueDate" ? 10 : 80),
      to: text(change.to, field === "assignee" ? 120 : field === "dueDate" ? 10 : 80),
    };
  }).filter(Boolean);
  return {
    id: text(event.id || `task-event-${index + 1}`, 120),
    type: text(event.type || "task-metadata-updated", 60),
    message: text(event.message, 400),
    at: safeTimestamp(event.at),
    changes,
  };
}

function normalizeEscalationAcknowledgement(value) {
  if (!isRecord(value)) return null;
  const acknowledgedAt = typeof value.acknowledgedAt === "string" && !Number.isNaN(Date.parse(value.acknowledgedAt)) ? value.acknowledgedAt : "";
  const acknowledgedBy = text(value.acknowledgedBy, 120);
  const note = text(value.note, 1200);
  const fingerprint = text(value.fingerprint, 500);
  if (!acknowledgedAt || !acknowledgedBy || !note || !fingerprint) return null;
  let dueDateSnapshot = "";
  try { dueDateSnapshot = normalizeDateOnly(value.dueDateSnapshot); } catch { dueDateSnapshot = ""; }
  return { acknowledgedAt, acknowledgedBy, note, fingerprint, dueDateSnapshot };
}

function normalizeTaskResolution(value) {
  if (!isRecord(value) || !["open", "resolved"].includes(value.status)) return null;
  return {
    status: value.status,
    resolvedAt: typeof value.resolvedAt === "string" && !Number.isNaN(Date.parse(value.resolvedAt)) ? value.resolvedAt : "",
    resolvedBy: text(value.resolvedBy, 120),
    note: text(value.note, 1200),
    evidenceReference: text(value.evidenceReference, 600),
    fingerprint: text(value.fingerprint, 500),
    reopenedAt: typeof value.reopenedAt === "string" && !Number.isNaN(Date.parse(value.reopenedAt)) ? value.reopenedAt : "",
    reopenedBy: text(value.reopenedBy, 120),
    reopenNote: text(value.reopenNote, 1200),
  };
}

function normalizeResolutionHistory(value) {
  return safeArray(value).filter(isRecord).slice(-MAX_TASK_RESOLUTION_HISTORY).map((entry) => ({
    status: "resolved",
    resolvedAt: typeof entry.resolvedAt === "string" && !Number.isNaN(Date.parse(entry.resolvedAt)) ? entry.resolvedAt : "",
    resolvedBy: text(entry.resolvedBy, 120),
    note: text(entry.note, 1200),
    evidenceReference: text(entry.evidenceReference, 600),
    fingerprint: text(entry.fingerprint, 500),
    supersededAt: typeof entry.supersededAt === "string" && !Number.isNaN(Date.parse(entry.supersededAt)) ? entry.supersededAt : "",
    supersededReason: text(entry.supersededReason, 240),
  }));
}

function normalizeFollowUpNotes(value) {
  return safeArray(value).filter(isRecord).slice(-MAX_TASK_FOLLOW_UP_NOTES).map((entry, index) => ({
    id: text(entry.id || `follow-up-${index + 1}`, 120),
    at: safeTimestamp(entry.at),
    author: text(entry.author, 120),
    note: text(entry.note, 1200),
    type: ["follow-up", "escalation-acknowledgement", "resolution", "reopen"].includes(entry.type) ? entry.type : "follow-up",
  })).filter((entry) => entry.author && entry.note);
}

/** Normalize task ownership independently from finding disposition/owner. */
export function normalizeRemediationWorkQueueTasks(value) {
  if (!Array.isArray(value)) return [];
  const byTaskId = new Map();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const taskId = text(raw.taskId, 1000);
    if (!taskId) continue;
    let dueDate = "";
    try { dueDate = normalizeDateOnly(raw.dueDate); } catch { dueDate = ""; }
    const auditTrail = safeArray(raw.auditTrail).map(normalizeAuditEvent).filter(Boolean).slice(-MAX_TASK_AUDIT_EVENTS);
    byTaskId.set(taskId, {
      taskId,
      assignee: text(raw.assignee, 120),
      dueDate,
      escalationAcknowledgement: normalizeEscalationAcknowledgement(raw.escalationAcknowledgement),
      taskResolution: normalizeTaskResolution(raw.taskResolution),
      resolutionHistory: normalizeResolutionHistory(raw.resolutionHistory),
      followUpNotes: normalizeFollowUpNotes(raw.followUpNotes),
      createdAt: safeTimestamp(raw.createdAt),
      updatedAt: safeTimestamp(raw.updatedAt, safeTimestamp(raw.createdAt)),
      auditTrail,
    });
  }
  return [...byTaskId.values()].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt)).slice(-MAX_TASKS_PER_RECORD);
}

function makeAuditEvent(type, message, at, changes) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `task-event-${Date.parse(at) || 0}-${suffix}`,
    type,
    message: text(message, 400),
    at,
    changes: changes.slice(0, 4).map((change) => ({
      field: change.field,
      from: text(change.from, change.field === "assignee" ? 120 : change.field === "dueDate" ? 10 : 80),
      to: text(change.to, change.field === "assignee" ? 120 : change.field === "dueDate" ? 10 : 80),
    })),
  };
}

/**
 * Update assignment/date metadata for one derived queue item. The task's lifecycle
 * is derived elsewhere; these fields never change the finding's canonical status.
 */
export function updateRemediationWorkQueueTask(tasksValue, taskIdValue, patchValue = {}, { updatedAt = new Date().toISOString() } = {}) {
  const taskId = text(taskIdValue, 1000);
  if (!taskId) throw new TypeError("A stable remediation task identifier is required.");
  if (!isRecord(patchValue)) throw new TypeError("Task metadata changes must be an object.");
  const tasks = normalizeRemediationWorkQueueTasks(tasksValue);
  const current = tasks.find((entry) => entry.taskId === taskId);
  const at = safeTimestamp(updatedAt);
  const patch = {};
  if (Object.hasOwn(patchValue, "assignee")) patch.assignee = text(patchValue.assignee, 120);
  if (Object.hasOwn(patchValue, "dueDate")) patch.dueDate = normalizeDateOnly(patchValue.dueDate);
  if (!Object.keys(patch).length) throw new TypeError("Provide an assignee and/or due date to save task metadata.");

  const nextFields = {
    assignee: Object.hasOwn(patch, "assignee") ? patch.assignee : current?.assignee || "",
    dueDate: Object.hasOwn(patch, "dueDate") ? patch.dueDate : current?.dueDate || "",
  };
  const changes = ["assignee", "dueDate"].filter((field) => (current?.[field] || "") !== nextFields[field])
    .map((field) => ({ field, from: current?.[field] || "", to: nextFields[field] }));
  if (current && changes.length === 0) return { tasks, task: current, changed: false };
  if (!current && !nextFields.assignee && !nextFields.dueDate) return { tasks, task: null, changed: false };

  const event = makeAuditEvent(
    current ? "task-metadata-updated" : "task-metadata-created",
    changes.length ? `${changes.map(({ field, from, to }) => `${field === "assignee" ? "Assignee" : "Due date"} ${from ? `changed from ${from}` : "set"}${to ? ` to ${to}` : "cleared"}`).join("; ")}.` : "Task metadata created.",
    at,
    changes,
  );
  const nextTask = {
    taskId,
    assignee: nextFields.assignee,
    dueDate: nextFields.dueDate,
    escalationAcknowledgement: current?.escalationAcknowledgement || null,
    taskResolution: current?.taskResolution || null,
    resolutionHistory: current?.resolutionHistory || [],
    followUpNotes: current?.followUpNotes || [],
    createdAt: current?.createdAt || at,
    updatedAt: at,
    auditTrail: [...(current?.auditTrail || []), event].slice(-MAX_TASK_AUDIT_EVENTS),
  };
  const nextTasks = current
    ? tasks.map((entry) => entry.taskId === taskId ? nextTask : entry)
    : [...tasks, nextTask].slice(-MAX_TASKS_PER_RECORD);
  return { tasks: nextTasks, task: nextTask, changed: true };
}

export function getRemediationTaskMetadata(record, taskId) {
  const targetId = text(taskId, 1000);
  return normalizeRemediationWorkQueueTasks(record?.workQueueTasks).find((entry) => entry.taskId === targetId) || null;
}

function mutateTaskMetadata(tasksValue, taskIdValue, mutation, { updatedAt = new Date().toISOString() } = {}) {
  const taskId = text(taskIdValue, 1000);
  if (!taskId) throw new TypeError("A stable remediation task identifier is required.");
  const tasks = normalizeRemediationWorkQueueTasks(tasksValue);
  const current = tasks.find((entry) => entry.taskId === taskId) || null;
  const at = safeTimestamp(updatedAt);
  const base = current || {
    taskId, assignee: "", dueDate: "", escalationAcknowledgement: null, taskResolution: null,
    resolutionHistory: [], followUpNotes: [], createdAt: at, updatedAt: at, auditTrail: [],
  };
  const result = mutation(base, at);
  if (!result || result.changed === false) return { tasks, task: current || base, changed: false };
  const nextTask = {
    ...base,
    ...result.patch,
    taskId,
    createdAt: base.createdAt || at,
    updatedAt: at,
    auditTrail: [...base.auditTrail, makeAuditEvent(result.type, result.message, at, result.changes || [])].slice(-MAX_TASK_AUDIT_EVENTS),
  };
  const nextTasks = current
    ? tasks.map((entry) => entry.taskId === taskId ? nextTask : entry)
    : [...tasks, nextTask].slice(-MAX_TASKS_PER_RECORD);
  return { tasks: nextTasks, task: nextTask, changed: true };
}

function appendFollowUp(noteRows, { author, note, type }, at) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return [...normalizeFollowUpNotes(noteRows), {
    id: `task-note-${Date.parse(at) || 0}-${suffix}`,
    at,
    author: text(author, 120),
    note: text(note, 1200),
    type: ["follow-up", "escalation-acknowledgement", "resolution", "reopen"].includes(type) ? type : "follow-up",
  }].slice(-MAX_TASK_FOLLOW_UP_NOTES);
}

/** Acknowledgement is tied to the exact overdue blocker state, so a changed due date makes it stale. */
export function acknowledgeRemediationWorkQueueEscalation(tasksValue, taskIdValue, {
  acknowledgedBy, note, fingerprint, dueDateSnapshot,
} = {}, { updatedAt = new Date().toISOString() } = {}) {
  const author = text(acknowledgedBy, 120);
  const followUp = text(note, 1200);
  const sourceFingerprint = text(fingerprint, 500);
  if (!author) throw new TypeError("Enter who is acknowledging this overdue escalation.");
  if (!followUp) throw new TypeError("Record a follow-up note when acknowledging the escalation.");
  if (!sourceFingerprint) throw new TypeError("The escalation state fingerprint is required.");
  const dateSnapshot = normalizeDateOnly(dueDateSnapshot);
  return mutateTaskMetadata(tasksValue, taskIdValue, (current, at) => {
    const previous = current.escalationAcknowledgement;
    if (previous?.fingerprint === sourceFingerprint) return { changed: false };
    const acknowledgement = {
      acknowledgedAt: at, acknowledgedBy: author, note: followUp,
      fingerprint: sourceFingerprint, dueDateSnapshot: dateSnapshot,
    };
    return {
      patch: {
        escalationAcknowledgement: acknowledgement,
        followUpNotes: appendFollowUp(current.followUpNotes, { author, note: followUp, type: "escalation-acknowledgement" }, at),
      },
      type: "escalation-acknowledged",
      message: `Overdue blocker escalation acknowledged by ${author}: ${followUp}`,
      changes: [{ field: "escalationAcknowledgement", from: previous?.fingerprint || "unacknowledged", to: sourceFingerprint }],
    };
  }, { updatedAt });
}

/** Append a task-level follow-up note without changing a finding or its evidence. */
export function recordRemediationWorkQueueFollowUpNote(tasksValue, taskIdValue, { author, note } = {}, { updatedAt = new Date().toISOString() } = {}) {
  const noteAuthor = text(author, 120);
  const noteText = text(note, 1200);
  if (!noteAuthor) throw new TypeError("Enter an author for the follow-up note.");
  if (!noteText) throw new TypeError("Enter a follow-up note before saving.");
  return mutateTaskMetadata(tasksValue, taskIdValue, (current, at) => ({
    patch: { followUpNotes: appendFollowUp(current.followUpNotes, { author: noteAuthor, note: noteText, type: "follow-up" }, at) },
    type: "task-follow-up-noted",
    message: `Follow-up note added by ${noteAuthor}: ${noteText}`,
    changes: [{ field: "followUpNote", from: "", to: noteText.slice(0, 80) }],
  }), { updatedAt });
}

/** Resolve only the queue task. Canonical finding disposition and evidence snapshots are untouched. */
export function resolveRemediationWorkQueueTask(tasksValue, taskIdValue, {
  resolvedBy, note, evidenceReference = "", fingerprint,
} = {}, { updatedAt = new Date().toISOString() } = {}) {
  const author = text(resolvedBy, 120);
  const resolutionNote = text(note, 1200);
  const sourceFingerprint = text(fingerprint, 500);
  if (!author) throw new TypeError("Enter who is resolving this queue task.");
  if (!resolutionNote) throw new TypeError("Record a resolution note before completing the task.");
  if (!sourceFingerprint) throw new TypeError("The current task fingerprint is required to resolve this task.");
  return mutateTaskMetadata(tasksValue, taskIdValue, (current, at) => {
    if (current.taskResolution?.status === "resolved" && current.taskResolution.fingerprint === sourceFingerprint) return { changed: false };
    const history = [...current.resolutionHistory];
    if (current.taskResolution?.status === "resolved") {
      history.push({
        ...current.taskResolution,
        supersededAt: at,
        supersededReason: current.taskResolution.fingerprint === sourceFingerprint ? "Resolved again after prior state" : "Prior resolution fingerprint no longer matches current task",
      });
    }
    const resolution = {
      status: "resolved", resolvedAt: at, resolvedBy: author, note: resolutionNote,
      evidenceReference: text(evidenceReference, 600), fingerprint: sourceFingerprint,
      reopenedAt: "", reopenedBy: "", reopenNote: "",
    };
    return {
      patch: {
        taskResolution: resolution,
        resolutionHistory: normalizeResolutionHistory(history),
        followUpNotes: appendFollowUp(current.followUpNotes, { author, note: resolutionNote, type: "resolution" }, at),
      },
      type: "task-resolved",
      message: `Queue task marked resolved by ${author}: ${resolutionNote}`,
      changes: [{ field: "taskResolution", from: current.taskResolution?.status || "open", to: "resolved" }],
    };
  }, { updatedAt });
}

/** Reopen a completed task while preserving the prior resolution as historical audit data. */
export function reopenRemediationWorkQueueTask(tasksValue, taskIdValue, {
  reopenedBy, note,
} = {}, { updatedAt = new Date().toISOString() } = {}) {
  const author = text(reopenedBy, 120);
  const reopenNote = text(note, 1200);
  if (!author) throw new TypeError("Enter who is reopening this queue task.");
  if (!reopenNote) throw new TypeError("Record why the queue task is being reopened.");
  return mutateTaskMetadata(tasksValue, taskIdValue, (current, at) => {
    if (current.taskResolution?.status !== "resolved") return { changed: false };
    const history = [...current.resolutionHistory, {
      ...current.taskResolution,
      supersededAt: at,
      supersededReason: `Reopened by ${author}: ${reopenNote}`,
    }];
    return {
      patch: {
        taskResolution: {
          ...current.taskResolution, status: "open", reopenedAt: at, reopenedBy: author, reopenNote,
        },
        resolutionHistory: normalizeResolutionHistory(history),
        followUpNotes: appendFollowUp(current.followUpNotes, { author, note: reopenNote, type: "reopen" }, at),
      },
      type: "task-reopened",
      message: `Queue task reopened by ${author}: ${reopenNote}`,
      changes: [{ field: "taskResolution", from: "resolved", to: "open" }],
    };
  }, { updatedAt });
}
