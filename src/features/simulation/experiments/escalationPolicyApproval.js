const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const arr = (value) => Array.isArray(value) ? value : [];
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const validTimestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

function normalizePolicyEntry(entry) {
  if (!isRecord(entry) || !isRecord(entry.policy) || !clean(entry.id, 180) || !validTimestamp(entry.changedAt)) throw new TypeError("Provide a valid recorded policy version entry.");
  const policy = entry.policy;
  if (!clean(policy.id, 100) || !Number.isSafeInteger(policy.version) || policy.version < 1) throw new TypeError("Policy entry must contain a valid policy ID and version.");
  if (!Number.isSafeInteger(policy.overdueDays) || policy.overdueDays < 1 || !Number.isSafeInteger(policy.agingDays) || policy.agingDays < 1 || !Array.isArray(policy.severities) || !policy.severities.length) throw new TypeError("Policy entry contains invalid policy settings.");
  return { id: clean(entry.id, 180), policy: { id: clean(policy.id, 100), version: policy.version, overdueDays: policy.overdueDays, agingDays: policy.agingDays, severities: [...new Set(policy.severities)], rolloutBlockersOnly: policy.rolloutBlockersOnly === true }, changedAt: entry.changedAt, changedBy: clean(entry.changedBy, 120), rationale: clean(entry.rationale, 1200) };
}

function policySnapshot(entry) {
  const p = normalizePolicyEntry(entry).policy;
  return JSON.stringify({ id: p.id, version: p.version, overdueDays: p.overdueDays, agingDays: p.agingDays, severities: [...p.severities].sort(), rolloutBlockersOnly: p.rolloutBlockersOnly });
}

function latestEvent(events, entryId) {
  // The array is an append-only audit log: use append order, not user-controlled timestamps.
  return arr(events).filter((event) => isRecord(event) && event.policyEntryId === entryId).at(-1) || null;
}

/** Validate the retained approval log without mutating policy or event records. */
export function validateRemediationHandoffPolicyApprovalHistory(policyHistory, approvalEvents) {
  const entries = arr(policyHistory).filter(isRecord).map(normalizePolicyEntry);
  const events = arr(approvalEvents).filter(isRecord);
  const issues = [];
  const seenIds = new Set();
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const event of events) {
    const eventId = clean(event.id, 180);
    if (!eventId) issues.push({ code: "duplicate_or_missing_event_id", eventId, policyEntryId: clean(event.policyEntryId, 180), message: "Approval event IDs must be present and unique." });
    else if (seenIds.has(eventId)) issues.push({ code: "duplicate_or_missing_event_id", eventId, policyEntryId: "", message: "Approval event IDs must be present and unique; duplicate IDs affect the global audit trail." });
    else seenIds.add(eventId);
    if (!entryIds.has(clean(event.policyEntryId, 180))) issues.push({ code: "orphan_event", eventId, policyEntryId: "", message: "Approval event references a policy entry that is not present in retained governance history." });
  }
  for (const entry of entries) {
    const trail = events.filter((event) => event.policyEntryId === entry.id);
    let state = "draft";
    let previousAt = -Infinity;
    for (const event of trail) {
      const at = validTimestamp(event.at) ? Date.parse(event.at) : NaN;
      const expectedStatus = event.action === "submit" ? "pending_approval" : event.action === "approve" ? "approved" : event.action === "reject" ? "rejected" : "";
      const validIdentity = event.policyId === entry.policy.id && event.policyVersion === entry.policy.version;
      if (!expectedStatus || event.status !== expectedStatus) issues.push({ code: "action_status_mismatch", eventId: clean(event.id, 180), policyEntryId: entry.id, message: "Approval action and status do not agree." });
      if (!validIdentity) issues.push({ code: "policy_identity_mismatch", eventId: clean(event.id, 180), policyEntryId: entry.id, message: "Approval event policy identity does not match its retained policy version." });
      if (!clean(event.actor, 120) || !clean(event.rationale, 1200) || Number.isNaN(at)) issues.push({ code: "incomplete_event", eventId: clean(event.id, 180), policyEntryId: entry.id, message: "Approval events require an actor, rationale, and valid timestamp." });
      if (at < previousAt) issues.push({ code: "non_monotonic_timestamp", eventId: clean(event.id, 180), policyEntryId: entry.id, message: "Approval event timestamps must be non-decreasing in append order." });
      previousAt = Number.isNaN(at) ? previousAt : at;
      if (event.action === "submit") {
        if (state === "pending_approval" || state === "approved") issues.push({ code: "invalid_transition", eventId: clean(event.id, 180), policyEntryId: entry.id, message: `Cannot submit a policy while its prior state is ${state}.` });
        state = "pending_approval";
      } else if (event.action === "approve" || event.action === "reject") {
        if (state !== "pending_approval") issues.push({ code: "invalid_transition", eventId: clean(event.id, 180), policyEntryId: entry.id, message: `Cannot ${event.action} a policy while its prior state is ${state}.` });
        if (event.action === "approve" && clean(event.actor, 120).toLowerCase() === clean(entry.changedBy, 120).toLowerCase()) issues.push({ code: "self_approval", eventId: clean(event.id, 180), policyEntryId: entry.id, message: "The change owner cannot approve their own policy version." });
        state = expectedStatus || state;
      }
    }
  }
  return { valid: issues.length === 0, issueCount: issues.length, issues, classification: "derived-policy-approval-history-validation", independentlyVerified: false };
}

/** Append a human-attributed policy lifecycle event. Events are append-only audit records. */
export function recordRemediationHandoffPolicyApprovalEvent(eventValues, entryValue, { action, actor, rationale, at = new Date().toISOString(), id } = {}) {
  const entry = normalizePolicyEntry(entryValue);
  const events = arr(eventValues).filter(isRecord);
  const eventId = clean(id || `policy-approval-${entry.id}-${events.length + 1}`, 180);
  const who = clean(actor, 120), why = clean(rationale, 1200);
  if (!eventId || events.some((event) => event.id === eventId)) throw new TypeError("Approval event IDs must be unique.");
  if (!who || !why || !validTimestamp(at)) throw new TypeError("Policy workflow events require an actor, rationale, and valid timestamp.");
  if (!["submit", "approve", "reject"].includes(action)) throw new TypeError("Policy workflow action must be submit, approve, or reject.");
  const latest = latestEvent(events, entry.id);
  if (latest && Date.parse(at) < Date.parse(latest.at || "")) throw new TypeError("Workflow events cannot predate the latest appended policy workflow event.");
  if (action === "submit") {
    if (latest?.status === "pending_approval") throw new TypeError("This policy version is already pending approval.");
    if (latest?.status === "approved") throw new TypeError("An approved policy version cannot be resubmitted; create a new policy version.");
  } else {
    if (!latest || latest.status !== "pending_approval") throw new TypeError("Only a policy version pending approval can be approved or rejected.");
    if (action === "approve" && who.toLowerCase() === clean(entry.changedBy, 120).toLowerCase()) throw new TypeError("The policy change owner cannot approve their own policy version; use a separate reviewer.");
  }
  const status = action === "submit" ? "pending_approval" : action === "approve" ? "approved" : "rejected";
  const event = { id: eventId, policyEntryId: entry.id, policyId: entry.policy.id, policyVersion: entry.policy.version, action, status, actor: who, rationale: why, at, policySnapshot: policySnapshot(entry), classification: "human-attributed-policy-approval-event", independentlyVerified: false };
  return { events: [...events, event].slice(-1000), event, status, changed: true };
}

/** Evaluate whether a specific recorded policy version is eligible for a release gate. */
export function evaluateRemediationHandoffPolicyReleaseGate(policyHistory, approvalEvents, policyId, version) {
  const id = clean(policyId, 100);
  if (!id || !Number.isSafeInteger(version) || version < 1) throw new TypeError("Provide a policy ID and positive integer version for release-gate evaluation.");
  const entries = arr(policyHistory).filter(isRecord).map(normalizePolicyEntry).filter((entry) => entry.policy.id === id && entry.policy.version === version);
  if (entries.length !== 1) return { allowed: false, status: "unmatched_policy_version", policyId: id, policyVersion: version, policyEntryId: "", reason: "The requested policy version does not resolve to exactly one retained governance entry.", classification: "derived-policy-release-gate", independentlyVerified: false };
  const entry = entries[0];
  const historyValidation = validateRemediationHandoffPolicyApprovalHistory(policyHistory, approvalEvents);
  const entryIssues = historyValidation.issues.filter((issue) => issue.policyEntryId === entry.id || !issue.policyEntryId);
  if (entryIssues.length) return { allowed: false, status: "invalid_approval_history", policyId: id, policyVersion: version, policyEntryId: entry.id, reason: `Approval history failed integrity validation (${entryIssues.length} issue(s)); release is blocked.`, integrityIssues: entryIssues, classification: "derived-policy-release-gate", independentlyVerified: false };
  const latest = latestEvent(approvalEvents, entry.id);
  if (!latest) return { allowed: false, status: "draft", policyId: id, policyVersion: version, policyEntryId: entry.id, reason: "No approval workflow has been recorded for this policy version.", classification: "derived-policy-release-gate", independentlyVerified: false };
  const snapshotMatches = latest.policySnapshot === policySnapshot(entry);
  const allowed = latest.status === "approved" && snapshotMatches;
  const reason = !snapshotMatches ? "The recorded workflow snapshot does not match the current policy entry; approval cannot be relied upon." : latest.status !== "approved" ? `Policy status is ${latest.status}; approval is required before release.` : "An approval record exists for this exact retained policy version.";
  return { allowed, status: snapshotMatches ? latest.status : "approval_stale", policyId: id, policyVersion: version, policyEntryId: entry.id, latestEventId: latest.id, reviewer: latest.status === "approved" ? latest.actor : "", approvedAt: latest.status === "approved" ? latest.at : "", reason, classification: "derived-policy-release-gate", independentlyVerified: false };
}

/** Build an audit summary for policy workflow states and release eligibility. */
export function buildRemediationHandoffPolicyApprovalReport(policyHistory, approvalEvents, { generatedAt = new Date().toISOString() } = {}) {
  if (!validTimestamp(generatedAt)) throw new TypeError("Provide a valid report generation timestamp.");
  const entries = arr(policyHistory).filter(isRecord).map(normalizePolicyEntry);
  const events = arr(approvalEvents).filter(isRecord);
  const policies = entries.map((entry) => {
    const gate = evaluateRemediationHandoffPolicyReleaseGate(entries, events, entry.policy.id, entry.policy.version);
    const trail = events.filter((event) => event.policyEntryId === entry.id).map((event) => ({ id: clean(event.id, 180), action: clean(event.action, 40), status: clean(event.status, 40), actor: clean(event.actor, 120), rationale: clean(event.rationale, 1200), at: validTimestamp(event.at) ? event.at : "", snapshotMatches: event.policySnapshot === policySnapshot(entry) }));
    return { policyEntryId: entry.id, policyId: entry.policy.id, version: entry.policy.version, changedBy: entry.changedBy, changedAt: entry.changedAt, status: gate.status, releaseAllowed: gate.allowed, releaseReason: gate.reason, latestEventId: gate.latestEventId || "", events: trail };
  });
  const integrity = validateRemediationHandoffPolicyApprovalHistory(entries, events);
  return { generatedAt, policyVersionCount: policies.length, approvedCount: policies.filter((item) => item.status === "approved" && item.releaseAllowed).length, pendingCount: policies.filter((item) => item.status === "pending_approval").length, rejectedCount: policies.filter((item) => item.status === "rejected").length, blockedCount: policies.filter((item) => !item.releaseAllowed).length, integrityValid: integrity.valid, integrityIssueCount: integrity.issueCount, integrityIssues: integrity.issues, policies, classification: "derived-policy-approval-audit-report", disclaimer: "This report reflects retained workflow metadata. It is not proof of deployment, organizational authorization outside this record, or independent verification. A blocked policy release gate does not clear or mutate other rollout blockers." };
}

export function formatRemediationHandoffPolicyApprovalMarkdown(report) {
  if (!isRecord(report) || !Array.isArray(report.policies)) throw new TypeError("Provide a policy approval audit report.");
  const lines = ["# Escalation Policy Approval & Release-Gate Report", "", `Generated: ${report.generatedAt}`, `Policy versions: ${report.policyVersionCount}`, `Approved and eligible: ${report.approvedCount}`, `Pending approval: ${report.pendingCount}`, `Rejected: ${report.rejectedCount}`, `Blocked from release: ${report.blockedCount}`, `Approval history integrity: ${report.integrityValid === false ? `FAILED (${report.integrityIssueCount} issue(s))` : "valid"}`, "", "## Policy version status", ""];
  for (const policy of report.policies) {
    lines.push(`- **${policy.policyId} v${policy.version}** — ${policy.status}; release ${policy.releaseAllowed ? "eligible" : "blocked"}. Changed by ${policy.changedBy || "unknown"} at ${policy.changedAt}. ${policy.releaseReason}`);
    for (const event of policy.events) lines.push(`  - ${event.at || "unknown time"}: ${event.action} by ${event.actor || "unknown actor"} (${event.status}); snapshot ${event.snapshotMatches ? "matches" : "does not match"}. ${event.rationale}`);
  }
  if (Array.isArray(report.integrityIssues) && report.integrityIssues.length) {
    lines.push("", "## Approval history integrity issues", "");
    for (const issue of report.integrityIssues) lines.push(`- ${issue.code} (${issue.eventId || "no event ID"}): ${issue.message}`);
  }
  lines.push("", `> ${report.disclaimer}`, "");
  return lines.join("\n");
}
