const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const arr = (value) => Array.isArray(value) ? value : [];
const text = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const timestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : "";
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function normalizePolicy(value) {
  if (!isRecord(value)) throw new TypeError("Provide a policy definition.");
  const id = text(value.id, 100);
  const version = value.version;
  if (!id || !Number.isSafeInteger(version) || version < 1) throw new TypeError("A policy requires a stable ID and positive integer version.");
  if (!Number.isSafeInteger(value.overdueDays) || value.overdueDays < 1 || value.overdueDays > 365 || !Number.isSafeInteger(value.agingDays) || value.agingDays < 1 || value.agingDays > 365) throw new TypeError("Policy thresholds must be between 1 and 365 days.");
  if (!Array.isArray(value.severities) || !value.severities.length || value.severities.some((severity) => !["error", "warning", "info"].includes(severity))) throw new TypeError("A policy must contain valid finding severities.");
  return { id, version, overdueDays: value.overdueDays, agingDays: value.agingDays, severities: [...new Set(value.severities)], rolloutBlockersOnly: value.rolloutBlockersOnly === true };
}

/** Append an immutable policy version with reviewer-attributed change rationale. */
export function recordRemediationHandoffPolicyVersion(historyValues, policyValue, { changedAt = new Date().toISOString(), changedBy, rationale, id } = {}) {
  const history = arr(historyValues).filter(isRecord);
  const policy = normalizePolicy(policyValue);
  const at = timestamp(changedAt), actor = text(changedBy, 120), why = text(rationale, 1200);
  if (!at || !actor || !why) throw new TypeError("Policy changes require a valid timestamp, change owner, and rationale.");
  if (history.some((entry) => entry.id === text(id, 180) || (entry.policy?.id === policy.id && entry.policy?.version === policy.version))) throw new TypeError("This policy version already exists in the governance history.");
  const previous = history.filter((entry) => entry.policy?.id === policy.id).sort((a, b) => b.policy.version - a.policy.version)[0];
  if (previous && policy.version !== previous.policy.version + 1) throw new TypeError("Policy versions must increase sequentially without gaps.");
  if (previous && Date.parse(at) < Date.parse(previous.changedAt)) throw new TypeError("A policy version cannot predate the previous version.");
  const entry = { id: text(id || `policy-${policy.id}-v${policy.version}`, 180), policy, changedAt: at, changedBy: actor, rationale: why, previousVersion: previous?.policy.version ?? null, classification: "human-authored-escalation-policy-version", independentlyVerified: false };
  if (!entry.id) throw new TypeError("A policy history entry requires an ID.");
  return { history: [...history, entry].slice(-500), entry, changed: true };
}

/** Compare two normalized versions without mutating either version. */
export function compareRemediationHandoffPolicyVersions(leftValue, rightValue) {
  const left = normalizePolicy(leftValue), right = normalizePolicy(rightValue);
  if (left.id !== right.id) throw new TypeError("Compare versions of the same policy ID.");
  const fields = ["overdueDays", "agingDays", "rolloutBlockersOnly", "severities"];
  const changes = fields.filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field])).map((field) => ({ field, before: left[field], after: right[field] }));
  return { policyId: left.id, fromVersion: left.version, toVersion: right.version, changes, changed: changes.length > 0, classification: "derived-policy-version-comparison" };
}

/** Resolve the policy version effective at a decision timestamp and report audit coverage. */
export function buildRemediationHandoffPolicyGovernanceReport(historyValues, noteValues, { generatedAt = new Date().toISOString() } = {}) {
  const history = arr(historyValues).filter((entry) => isRecord(entry) && isRecord(entry.policy) && timestamp(entry.changedAt));
  const notes = arr(noteValues).filter(isRecord);
  const versions = history.map((entry) => ({ ...entry, policy: normalizePolicy(entry.policy) }));
  const decisions = notes.flatMap((note) => arr(note.escalationDecisions).filter(isRecord).map((decision) => ({ ...decision, handoffNoteId: text(note.id, 180) })));
  const linked = decisions.map((decision) => {
    const applicable = versions.filter((entry) => entry.policy.id === text(decision.policyId, 100) && Date.parse(entry.changedAt) <= Date.parse(decision.decidedAt || "" )).sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
    const effective = applicable[0] || null;
    return { decisionId: text(decision.id, 180), actionId: text(decision.actionId, 180), handoffNoteId: decision.handoffNoteId, policyId: text(decision.policyId, 100), decision: text(decision.decision, 40), decidedAt: timestamp(decision.decidedAt), policyVersion: effective?.policy.version ?? null, policyVersionEntryId: effective?.id ?? "", policyVersionMatched: Boolean(effective), superseded: Boolean(decision.supersededBy || arr(decisions).some((candidate) => candidate.supersedesDecisionId === decision.id)) };
  });
  const policyChanges = versions.map((entry) => {
    const previous = versions.filter((candidate) => candidate.policy.id === entry.policy.id && candidate.policy.version < entry.policy.version).sort((a, b) => b.policy.version - a.policy.version)[0];
    return { entryId: entry.id, policyId: entry.policy.id, version: entry.policy.version, changedAt: entry.changedAt, changedBy: entry.changedBy, rationale: entry.rationale, comparison: previous ? compareRemediationHandoffPolicyVersions(previous.policy, entry.policy) : { changed: true, changes: [] } };
  }).sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
  const at = timestamp(generatedAt);
  if (!at) throw new TypeError("Provide a valid governance report timestamp.");
  return { generatedAt: at, policyVersionCount: versions.length, decisionCount: decisions.length, policyChanges, decisions: linked, unversionedDecisionCount: linked.filter((item) => !item.policyVersionMatched).length, supersededDecisionCount: linked.filter((item) => item.superseded).length, classification: "derived-escalation-policy-governance-report", disclaimer: "This report links retained decision records to the latest recorded policy version effective at decision time. It is not proof that a policy was deployed, communicated, or independently approved." };
}

export function formatRemediationHandoffPolicyGovernanceMarkdown(report) {
  if (!isRecord(report) || !Array.isArray(report.policyChanges) || !Array.isArray(report.decisions)) throw new TypeError("Provide a policy governance report.");
  const lines = ["# Escalation Policy Governance Report", "", `Generated: ${report.generatedAt}`, `Policy versions: ${report.policyVersionCount}`, `Escalation decisions: ${report.decisionCount}`, `Decisions without a matching version: ${report.unversionedDecisionCount}`, `Superseded decisions: ${report.supersededDecisionCount}`, "", "## Policy change history", ""];
  for (const item of report.policyChanges) {
    lines.push(`- **${item.policyId} v${item.version}** — ${item.changedAt}; changed by ${item.changedBy}. ${item.rationale}`);
    for (const change of item.comparison.changes) lines.push(`  - ${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`);
  }
  lines.push("", "## Decision-to-policy links", "");
  for (const decision of report.decisions) lines.push(`- ${decision.decisionId || "(missing ID)"}: ${decision.decision || "unknown"} on action ${decision.actionId || "(missing action)"}; policy ${decision.policyId || "(missing policy)"}, version ${decision.policyVersion ?? "UNMATCHED"}; ${decision.superseded ? "superseded" : "not marked superseded"}.`);
  lines.push("", `> ${report.disclaimer}`, "");
  return lines.join("\n");
}
