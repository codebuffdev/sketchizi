import test from "node:test";
import assert from "node:assert/strict";
import { recordRemediationHandoffPolicyVersion } from "../src/features/simulation/experiments/escalationPolicyGovernance.js";
import { recordRemediationHandoffPolicyApprovalEvent, evaluateRemediationHandoffPolicyReleaseGate, buildRemediationHandoffPolicyApprovalReport, formatRemediationHandoffPolicyApprovalMarkdown } from "../src/features/simulation/experiments/escalationPolicyApproval.js";

const policy = { id: "release-policy", version: 1, overdueDays: 2, agingDays: 14, severities: ["error", "warning"], rolloutBlockersOnly: true };
function setup() {
  const result = recordRemediationHandoffPolicyVersion([], policy, { id: "policy-entry-v1", changedAt: "2026-10-20T08:00:00.000Z", changedBy: "Policy owner", rationale: "Initial governed policy." });
  return { history: result.history, entry: result.entry, events: [] };
}
function event(state, action, actor, at, rationale = `${action} because review completed`) {
  const result = recordRemediationHandoffPolicyApprovalEvent(state.events, state.entry, { action, actor, at, rationale, id: `${action}-${state.events.length + 1}` });
  state.events = result.events;
  return result;
}

test("release gate blocks a policy with no approval workflow", () => {
  const state = setup();
  const gate = evaluateRemediationHandoffPolicyReleaseGate(state.history, state.events, policy.id, 1);
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, "draft");
});

test("submission makes the policy pending and blocks release", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  assert.equal(evaluateRemediationHandoffPolicyReleaseGate(state.history, state.events, policy.id, 1).status, "pending_approval");
  assert.throws(() => event(state, "submit", "Policy owner", "2026-10-20T09:05:00.000Z"), /already pending/i);
});

test("policy owner cannot approve their own policy version", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  assert.throws(() => event(state, "approve", "Policy owner", "2026-10-20T09:10:00.000Z"), /separate reviewer/i);
});

test("separate reviewer approval opens the gate for the exact policy version", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z", "Thresholds and rollout scope reviewed.");
  const gate = evaluateRemediationHandoffPolicyReleaseGate(state.history, state.events, policy.id, 1);
  assert.equal(gate.allowed, true);
  assert.equal(gate.status, "approved");
  assert.equal(gate.reviewer, "Independent reviewer");
});

test("rejected policy remains blocked and may be resubmitted for review", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "reject", "Independent reviewer", "2026-10-20T09:15:00.000Z", "Rationale needs clarification.");
  assert.equal(evaluateRemediationHandoffPolicyReleaseGate(state.history, state.events, policy.id, 1).status, "rejected");
  event(state, "submit", "Policy owner", "2026-10-20T10:00:00.000Z", "Updated rationale for resubmission.");
  assert.equal(evaluateRemediationHandoffPolicyReleaseGate(state.history, state.events, policy.id, 1).status, "pending_approval");
});

test("approval cannot be relied upon if the recorded policy snapshot changes", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  const mutatedHistory = structuredClone(state.history);
  mutatedHistory[0].policy.agingDays = 21;
  const gate = evaluateRemediationHandoffPolicyReleaseGate(mutatedHistory, state.events, policy.id, 1);
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, "approval_stale");
});

test("approval report exports state history and does not mutate policy history", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  const before = structuredClone(state.history);
  const report = buildRemediationHandoffPolicyApprovalReport(state.history, state.events, { generatedAt: "2026-10-20T11:00:00.000Z" });
  assert.equal(report.approvedCount, 1);
  assert.equal(report.blockedCount, 0);
  assert.deepEqual(state.history, before);
  assert.match(formatRemediationHandoffPolicyApprovalMarkdown(report), /Independent reviewer/);
  assert.match(report.disclaimer, /not proof of deployment/i);
});

test("release gate fails closed for unmatched policy versions and invalid workflow transitions", () => {
  const state = setup();
  assert.equal(evaluateRemediationHandoffPolicyReleaseGate(state.history, [], policy.id, 2).status, "unmatched_policy_version");
  assert.throws(() => event(state, "approve", "Independent reviewer", "2026-10-20T09:00:00.000Z"), /pending approval/i);
  assert.throws(() => recordRemediationHandoffPolicyApprovalEvent([], state.entry, { action: "approve", actor: "Reviewer", rationale: "Approve", at: "bad-time" }), /timestamp/i);
});

test("workflow event timestamps cannot move backward after rejection", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "reject", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  assert.throws(() => recordRemediationHandoffPolicyApprovalEvent(state.events, state.entry, {
    action: "submit", actor: "Policy owner", rationale: "Resubmission", at: "2026-10-20T09:10:00.000Z", id: "backdated-submit",
  }), /cannot predate the latest appended/i);
});

test("release gate fails closed when retained approval events are appended out of chronological order", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  const tampered = structuredClone(state.events);
  tampered[1].at = "2026-10-20T08:15:00.000Z";
  const gate = evaluateRemediationHandoffPolicyReleaseGate(state.history, tampered, policy.id, 1);
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, "invalid_approval_history");
  assert.match(gate.reason, /integrity validation/i);
});

test("approval audit reports duplicate event identifiers as integrity issues", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  const tampered = structuredClone(state.events);
  tampered[1].id = tampered[0].id;
  const report = buildRemediationHandoffPolicyApprovalReport(state.history, tampered, { generatedAt: "2026-10-20T11:00:00.000Z" });
  assert.equal(report.integrityValid, false);
  assert.ok(report.integrityIssues.some((issue) => issue.code === "duplicate_or_missing_event_id"));
  assert.match(formatRemediationHandoffPolicyApprovalMarkdown(report), /Approval history integrity issues/);
});

test("approval gate detects invalid action/status combinations in retained history", () => {
  const state = setup();
  event(state, "submit", "Policy owner", "2026-10-20T09:00:00.000Z");
  event(state, "approve", "Independent reviewer", "2026-10-20T09:15:00.000Z");
  const tampered = structuredClone(state.events);
  tampered[1].status = "rejected";
  const gate = evaluateRemediationHandoffPolicyReleaseGate(state.history, tampered, policy.id, 1);
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, "invalid_approval_history");
});
