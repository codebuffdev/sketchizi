import test from "node:test";
import assert from "node:assert/strict";
import { recordRemediationHandoffPolicyVersion, compareRemediationHandoffPolicyVersions, buildRemediationHandoffPolicyGovernanceReport, formatRemediationHandoffPolicyGovernanceMarkdown } from "../src/features/simulation/experiments/escalationPolicyGovernance.js";

const v1 = { id: "prod-rollout", version: 1, overdueDays: 1, agingDays: 7, severities: ["error", "warning"], rolloutBlockersOnly: false };
const v2 = { id: "prod-rollout", version: 2, overdueDays: 2, agingDays: 10, severities: ["error"], rolloutBlockersOnly: true };

test("policy governance records immutable, sequential policy versions with rationale", () => {
  const first = recordRemediationHandoffPolicyVersion([], v1, { changedAt: "2026-10-18T09:00:00.000Z", changedBy: "Release lead", rationale: "Establish initial thresholds.", id: "policy-v1-record" });
  const second = recordRemediationHandoffPolicyVersion(first.history, v2, { changedAt: "2026-10-20T09:00:00.000Z", changedBy: "SRE lead", rationale: "Limit escalation to rollout blockers.", id: "policy-v2-record" });
  assert.equal(second.entry.previousVersion, 1);
  assert.equal(first.entry.policy.version, 1, "recording a new version must not mutate prior versions");
  assert.throws(() => recordRemediationHandoffPolicyVersion(second.history, { ...v2, version: 4 }, { changedAt: "2026-10-21T09:00:00.000Z", changedBy: "Lead", rationale: "Gap test" }), /sequentially/i);
  assert.throws(() => recordRemediationHandoffPolicyVersion(second.history, v2, { changedAt: "2026-10-21T09:00:00.000Z", changedBy: "Lead", rationale: "Duplicate" }), /already exists/i);
});

test("policy comparison reports only changed fields and leaves input untouched", () => {
  const before = structuredClone(v1), after = structuredClone(v2);
  const comparison = compareRemediationHandoffPolicyVersions(before, after);
  assert.equal(comparison.changed, true);
  assert.deepEqual(comparison.changes.map((item) => item.field), ["overdueDays", "agingDays", "rolloutBlockersOnly", "severities"]);
  assert.deepEqual(before, v1);
  assert.throws(() => compareRemediationHandoffPolicyVersions(v1, { ...v2, id: "other" }), /same policy ID/i);
});

test("governance report links decisions to policy version effective at decision time", () => {
  const first = recordRemediationHandoffPolicyVersion([], v1, { changedAt: "2026-10-18T09:00:00.000Z", changedBy: "Release lead", rationale: "Initial policy.", id: "policy-v1-record" });
  const second = recordRemediationHandoffPolicyVersion(first.history, v2, { changedAt: "2026-10-20T09:00:00.000Z", changedBy: "SRE lead", rationale: "Tighten rollout scope.", id: "policy-v2-record" });
  const report = buildRemediationHandoffPolicyGovernanceReport(second.history, [{ id: "note-1", escalationDecisions: [
    { id: "decision-old", actionId: "action-1", policyId: "prod-rollout", decision: "defer", decidedAt: "2026-10-19T12:00:00.000Z" },
    { id: "decision-new", actionId: "action-2", policyId: "prod-rollout", decision: "escalate", decidedAt: "2026-10-20T10:00:00.000Z", supersedesDecisionId: "decision-old" },
    { id: "decision-unmatched", actionId: "action-3", policyId: "unversioned-policy", decision: "dismiss", decidedAt: "2026-10-20T10:00:00.000Z" },
  ] }], { generatedAt: "2026-10-20T12:00:00.000Z" });
  assert.equal(report.decisions[0].policyVersion, 1);
  assert.equal(report.decisions[1].policyVersion, 2);
  assert.equal(report.decisions[2].policyVersionMatched, false);
  assert.equal(report.unversionedDecisionCount, 1);
  assert.equal(report.supersededDecisionCount, 1);
  assert.equal(report.policyChanges[1].comparison.changes.length, 4);
  assert.match(formatRemediationHandoffPolicyGovernanceMarkdown(report), /Decisions without a matching version: 1/);
  assert.match(formatRemediationHandoffPolicyGovernanceMarkdown(report), /overdueDays/);
  assert.match(report.disclaimer, /not proof that a policy was deployed/i);
});

test("policy versioning validates threshold and metadata inputs", () => {
  assert.throws(() => recordRemediationHandoffPolicyVersion([], { ...v1, overdueDays: 0 }, { changedBy: "Lead", rationale: "Bad threshold", changedAt: "2026-10-18T09:00:00.000Z" }), /thresholds/i);
  assert.throws(() => recordRemediationHandoffPolicyVersion([], v1, { changedBy: "", rationale: "Missing owner", changedAt: "2026-10-18T09:00:00.000Z" }), /change owner/i);
});
