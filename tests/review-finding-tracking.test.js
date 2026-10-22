import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRemediationEffectivenessSummary,
  confirmRemediationVerification,
  createTrackedReviewFindingId,
  mergeReleaseBundleReviewFindings,
  normalizeDecisionReviewFindings,
  recordRemediationVerificationRun,
  reopenTrackedReviewFinding,
  summarizeDecisionReviewFindings,
  updateTrackedReviewFinding,
  buildReviewFindingObservationTimeline,
} from "../src/features/simulation/experiments/reviewFindingTracking.js";
import {
  createArchitectureDecisionRecord,
  formatArchitectureDecisionRecordMarkdown,
  updateArchitectureDecisionRecords,
} from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildRolloutReadiness } from "../src/features/simulation/experiments/rolloutReadiness.js";
import { createWorkbenchExtension, withWorkbenchExtension, readWorkbenchDocument } from "../src/features/workbench/workbenchDocument.js";

function makeReview(sourceName = "candidate.json") {
  return {
    sourceName,
    findings: [
      { code: "readiness-count-mismatch", severity: "error", title: "Readiness counts do not match", detail: "Saved counts conflict with checks." },
      { code: "open-readiness-check", severity: "warning", title: "A readiness check remains open", detail: "Review and complete the check." },
    ],
  };
}

function sampleReport(overrides = {}) {
  return {
    title: "Architecture Decision Report", baselineName: "Baseline A", proposedName: "Proposed B",
    decision: "Proceed to validation", rationale: "Test decision", confidence: "Low",
    changeStatus: "changed", changeCount: 1,
    counts: { addedComponents: 1, removedComponents: 0, modifiedComponents: 0, addedRelationships: 0, removedRelationships: 0, modifiedRelationships: 0 },
    changes: [{ action: "Added", subjectType: "Component", label: "Cache", detail: "New component." }],
    simulationStatus: "comparable", simulationReason: "Matching assumptions.",
    metrics: [{ key: "p95LatencyMs", label: "p95 latency", before: 250, after: 180, delta: -70, direction: "improved" }],
    bottlenecks: [], traceEvidence: null, recommendations: [], portfolio: [], risks: [], nextSteps: [], limitations: [], profileConfirmed: true,
    loadTestRecordsCount: 1,
    ...overrides,
  };
}

test("stable finding IDs are deterministic for the same underlying review finding", () => {
  const finding = makeReview().findings[0];
  assert.equal(createTrackedReviewFindingId(finding), createTrackedReviewFindingId({ ...finding }));
  assert.notEqual(createTrackedReviewFindingId(finding), createTrackedReviewFindingId({ ...finding, detail: "Different detail." }));
});

test("imports findings as Open with source and an initial per-finding audit event", () => {
  const result = mergeReleaseBundleReviewFindings([], makeReview("build-42.json"), { importedAt: "2026-10-19T10:00:00.000Z" });
  assert.equal(result.added, 2);
  assert.equal(result.reobserved, 0);
  assert.equal(result.findings[0].status, "open");
  assert.deepEqual(result.findings[0].sourceBundleNames, ["build-42.json"]);
  assert.match(result.findings[0].auditTrail[0].message, /Imported from build-42\.json/);
});

test("repeated import preserves disposition and notes additional source observation", () => {
  const first = mergeReleaseBundleReviewFindings([], makeReview("build-42.json"));
  const updated = updateTrackedReviewFinding(first.findings, first.findings[0].id, {
    owner: "Release owner", status: "accepted-risk", rationale: "Bounded and monitored.", evidence: "Risk ticket R-42",
  });
  const second = mergeReleaseBundleReviewFindings(updated.findings, makeReview("build-43.json"), { importedAt: "2026-10-19T11:00:00.000Z" });
  assert.equal(second.added, 0);
  assert.equal(second.reobserved, 2);
  const tracked = second.findings.find((finding) => finding.id === first.findings[0].id);
  assert.equal(tracked.status, "accepted-risk");
  assert.equal(tracked.owner, "Release owner");
  assert.deepEqual(tracked.sourceBundleNames, ["build-42.json", "build-43.json"]);
  assert.equal(second.reoccurrencesDetected, 1);
  assert.equal(tracked.reoccurrence?.state, "unreviewed");
  assert.ok(tracked.auditTrail.some((event) => event.type === "reoccurrence-detected"));
});

test("Accepted Risk and Resolved require owner, rationale, and supporting evidence", () => {
  const first = mergeReleaseBundleReviewFindings([], makeReview()).findings;
  assert.throws(() => updateTrackedReviewFinding(first, first[0].id, { status: "accepted-risk" }), /owner, rationale, supporting evidence/);
  assert.throws(() => updateTrackedReviewFinding(first, first[0].id, { status: "resolved", owner: "Platform", rationale: "Fixed." }), /supporting evidence/);
  const updated = updateTrackedReviewFinding(first, first[0].id, {
    status: "resolved", owner: "Platform", rationale: "Parser now validates count consistency.", evidence: "CI run 881 passed",
  });
  assert.equal(updated.finding.status, "resolved");
  assert.ok(updated.finding.resolvedAt);
  assert.ok(updated.finding.auditTrail.some((event) => event.type === "status-changed"));
  assert.ok(updated.events.length >= 4);
});

test("summary distinguishes open blockers, accepted risks, and resolved findings", () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview()).findings;
  const risk = updateTrackedReviewFinding(imported, imported[1].id, {
    status: "accepted-risk", owner: "SRE", rationale: "Impact is low and monitored.", evidence: "Risk R-100",
  }).findings;
  const summary = summarizeDecisionReviewFindings(risk);
  assert.equal(summary.total, 2);
  assert.equal(summary.open, 1);
  assert.equal(summary.blocking, 1);
  assert.equal(summary.acceptedRisk, 1);
});

test("decision record persistence, audit trail, Markdown export and readiness blockers include tracked findings", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-findings", owner: "Platform", rationale: "Review evidence before rollout." });
  const merged = mergeReleaseBundleReviewFindings([], makeReview("candidate.json"));
  const records = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: merged.findings }, { updatedAt: "2026-10-19T12:00:00.000Z" });
  const saved = records[0];
  assert.equal(saved.reviewFindings.length, 2);
  assert.ok(saved.auditTrail.some((event) => event.type === "review-finding-tracked"));
  const readiness = buildRolloutReadiness(saved);
  assert.equal(readiness.checks.find((check) => check.id === `review-finding-${saved.reviewFindings[0].id}`).state, "blocked");
  assert.equal(readiness.status, "blocked");
  const markdown = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(markdown, /Release review findings and remediation/);
  assert.match(markdown, /Open error-severity findings block rollout readiness/);
  assert.match(markdown, /Readiness counts do not match/);

  const workbench = createWorkbenchExtension({ activeViewId: "system", views: [{ id: "system", label: "System", description: "System" }], entities: [], relations: [], viewScenes: {} });
  workbench.decisionRecords = records;
  const loaded = readWorkbenchDocument({ elements: [], appState: {}, files: {}, extensions: withWorkbenchExtension({}, workbench) });
  assert.deepEqual(loaded.workbench.decisionRecords[0].reviewFindings, saved.reviewFindings);
});

test("decision-record update API rejects unsubstantiated non-open dispositions", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-incomplete-finding" });
  const imported = mergeReleaseBundleReviewFindings([], makeReview()).findings;
  assert.throws(() => updateArchitectureDecisionRecords([record], record.id, {
    reviewFindings: [{ ...imported[0], status: "resolved", owner: "Platform", rationale: "Fixed." }],
  }), /require an owner, rationale, and supporting evidence/i);
});

test("record audit history and per-finding history capture resolution", () => {
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-resolution" });
  const imported = mergeReleaseBundleReviewFindings([], makeReview());
  const records = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: imported.findings });
  const finding = records[0].reviewFindings[0];
  const changed = updateTrackedReviewFinding(records[0].reviewFindings, finding.id, {
    owner: "Release owner", status: "resolved", rationale: "Readiness counts are now derived from the checklist.", evidence: "Commit abc123; CI run 901",
  });
  const after = updateArchitectureDecisionRecords(records, record.id, { reviewFindings: changed.findings });
  assert.ok(after[0].auditTrail.some((event) => event.message.includes("open → resolved")));
  assert.ok(after[0].reviewFindings[0].auditTrail.some((event) => event.message.includes("Status changed from open to resolved")));
});

test("panel exposes bundle-to-record tracking, editable disposition, and audit UI", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Track findings in/);
  assert.match(panel, /Review findings &amp; remediation/);
  assert.match(panel, /Accepted Risk and Resolved dispositions require an owner, rationale, and supporting evidence/);
  assert.match(panel, /Finding audit trail/);
  assert.match(panel, /Reopen finding/);
  assert.match(panel, /reopenRecurringReviewFinding/);
  assert.match(panel, /Observation timeline/);
  assert.match(panel, /Latest observation differs from its predecessor/);
  assert.match(panel, /Fresh supporting evidence required/);
  assert.match(panel, /Required: fresh evidence from after this recurrence/);
  assert.match(panel, /Remediation effectiveness/);
  assert.match(panel, /Record verification run/);
  assert.match(panel, /Confirm remediation verified/);
  assert.match(panel, /Supporting evidence submitted and remediation verified are separate states/);
  assert.match(panel, /Unreviewed recurring error findings block rollout readiness/);
  assert.match(panel, /onUpdateArchitectureDecisionRecords/);
});


test("later bundle reoccurrence is detected without silently changing a resolved disposition", () => {
  const firstReview = { ...makeReview("release-evidence.json"), bundleMetadata: { recordId: "adr-recurrence", generatedAt: "2026-10-19T10:00:00.000Z" } };
  const first = mergeReleaseBundleReviewFindings([], firstReview, { importedAt: "2026-10-19T10:01:00.000Z" });
  const closed = updateTrackedReviewFinding(first.findings, first.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "The readiness count derivation was fixed.", evidence: "CI run 950 passed",
  }, { updatedAt: "2026-10-19T10:02:00.000Z" });

  const sameBundle = mergeReleaseBundleReviewFindings(closed.findings, firstReview, { importedAt: "2026-10-19T10:03:00.000Z" });
  assert.equal(sameBundle.reoccurrencesDetected, 0, "re-importing the identical export is not a new recurrence");
  assert.equal(sameBundle.findings[0].reoccurrence, null);

  const laterReview = { ...makeReview("release-evidence.json"), bundleMetadata: { recordId: "adr-recurrence", generatedAt: "2026-10-19T10:05:00.000Z" } };
  const later = mergeReleaseBundleReviewFindings(closed.findings, laterReview, { importedAt: "2026-10-19T10:06:00.000Z" });
  const recurring = later.findings[0];
  assert.equal(later.reoccurrencesDetected, 1);
  assert.equal(recurring.status, "resolved", "the previous disposition is not silently overwritten");
  assert.equal(recurring.reoccurrence.state, "unreviewed");
  assert.equal(recurring.reoccurrence.previousStatus, "resolved");
  assert.equal(recurring.reoccurrence.sourceBundleName, "release-evidence.json");
  assert.ok(recurring.auditTrail.some((event) => event.type === "reoccurrence-detected"));
});

test("reopening a recurring error finding is an explicit action and keeps the disposition audit", () => {
  const initial = { ...makeReview("release-1.json"), bundleMetadata: { recordId: "adr-reopen", generatedAt: "2026-10-19T11:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], initial, { importedAt: "2026-10-19T11:01:00.000Z" });
  const closed = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "accepted-risk", owner: "SRE", rationale: "Initially accepted with monitoring.", evidence: "Risk ticket R-202",
  }, { updatedAt: "2026-10-19T11:02:00.000Z" });
  const later = mergeReleaseBundleReviewFindings(closed.findings, {
    ...makeReview("release-2.json"), bundleMetadata: { recordId: "adr-reopen", generatedAt: "2026-10-19T11:05:00.000Z" },
  }, { importedAt: "2026-10-19T11:06:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-reopen", owner: "Platform", rationale: "Check recurring error." });
  const readinessBefore = buildRolloutReadiness({ ...record, reviewFindings: later.findings });
  const recurrenceCheck = readinessBefore.checks.find((check) => check.id === `review-finding-reoccurrence-${later.findings[0].id}`);
  assert.equal(recurrenceCheck.state, "blocked");
  assert.equal(readinessBefore.status, "blocked");

  const reopened = reopenTrackedReviewFinding(later.findings, later.findings[0].id, { updatedAt: "2026-10-19T11:07:00.000Z" });
  assert.equal(reopened.finding.status, "open");
  assert.equal(reopened.finding.reoccurrence.state, "reopened");
  assert.equal(reopened.finding.reoccurrence.previousStatus, "accepted-risk");
  assert.ok(reopened.finding.auditTrail.some((event) => event.type === "reoccurrence-reopened" && event.message.includes("previous disposition was accepted-risk")));
  assert.ok(reopened.finding.auditTrail.some((event) => event.type === "status-changed" && event.message.includes("accepted-risk to open")));
  assert.equal(summarizeDecisionReviewFindings(reopened.findings).reoccurrences, 0);
  assert.throws(() => reopenTrackedReviewFinding(reopened.findings, later.findings[0].id), /already Open/);
  const readinessAfter = buildRolloutReadiness({ ...record, reviewFindings: reopened.findings });
  assert.equal(readinessAfter.checks.find((check) => check.id === `review-finding-${later.findings[0].id}`).state, "blocked", "the reopened error finding remains an ordinary rollout blocker");
});

test("decision-record markdown and imported release-bundle review retain recurrence warnings", async () => {
  const initial = { ...makeReview("rel-1.json"), bundleMetadata: { recordId: "adr-markdown-recurrence", generatedAt: "2026-10-19T12:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], initial, { importedAt: "2026-10-19T12:01:00.000Z" });
  const closed = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "Remediated.", evidence: "CI run 1001",
  }, { updatedAt: "2026-10-19T12:02:00.000Z" });
  const recurring = mergeReleaseBundleReviewFindings(closed.findings, {
    ...makeReview("rel-2.json"), bundleMetadata: { recordId: "adr-markdown-recurrence", generatedAt: "2026-10-19T12:05:00.000Z" },
  }, { importedAt: "2026-10-19T12:06:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-markdown-recurrence", owner: "Platform", rationale: "Test report" });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: recurring.findings })[0];
  const markdown = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(markdown, /Reoccurrence:\*\* unreviewed; previously resolved/);
  assert.match(markdown, /reviewer action required/);
  const { reviewReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundleReview.js");
  const { buildReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundle.js");
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "recurring.json" });
  assert.ok(review.findings.some((finding) => finding.code === `tracked-review-finding-reoccurrence-0` && /Previously closed finding reappeared/.test(finding.title)));
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /previously closed finding\(s\) reappeared/.test(risk)));
});


test("a passing verification run is only submitted evidence until a reviewer explicitly confirms it", () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview("verify-a.json"));
  const finding = imported.findings[0];
  const recorded = recordRemediationVerificationRun(imported.findings, finding.id, {
    runType: "regression-test", outcome: "pass", beforeState: "The request returned an inconsistent readiness count.",
    afterState: "The updated test run returns consistent counts.", summary: "Re-ran the readiness regression in the target branch.",
    evidence: "CI run 1902", recordedBy: "Platform Engineer",
  }, { updatedAt: "2026-10-19T12:10:00.000Z" });
  assert.equal(recorded.finding.verificationRuns.length, 1);
  assert.equal(recorded.finding.remediationVerification.status, "not-verified");
  assert.equal(buildRemediationEffectivenessSummary(recorded.finding).status, "awaiting-confirmation");
  assert.throws(() => confirmRemediationVerification(recorded.findings, finding.id, recorded.run.id, {
    verifiedBy: "", rationale: "Looks fixed.",
  }, { updatedAt: "2026-10-19T12:11:00.000Z" }), /reviewer and verification rationale are required/i);
  const confirmed = confirmRemediationVerification(recorded.findings, finding.id, recorded.run.id, {
    verifiedBy: "Release reviewer", rationale: "Before/after test results meet the acceptance criteria.",
  }, { updatedAt: "2026-10-19T12:12:00.000Z" });
  const summary = buildRemediationEffectivenessSummary(confirmed.finding);
  assert.equal(summary.isVerified, true);
  assert.equal(summary.status, "verified");
  assert.equal(confirmed.finding.verificationRuns[0].reviewerVerifiedBy, "Release reviewer");
  assert.ok(confirmed.finding.auditTrail.some((event) => event.type === "remediation-verified"));
});

test("verification runs require before/after details, a recognized outcome, recorder, and evidence", () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview("verify-required.json"));
  assert.throws(() => recordRemediationVerificationRun(imported.findings, imported.findings[0].id, {
    outcome: "pass", beforeState: "Before", afterState: "After", summary: "Test", evidence: "CI 1", recordedBy: "Reviewer",
  }), /recognized verification method/i);
  assert.throws(() => recordRemediationVerificationRun(imported.findings, imported.findings[0].id, {
    runType: "regression-test", outcome: "pass", beforeState: "Before", afterState: "After", summary: "Test", recordedBy: "Reviewer",
  }), /distinct supporting evidence reference/i);
  const failed = recordRemediationVerificationRun(imported.findings, imported.findings[0].id, {
    runType: "load-test", outcome: "fail", beforeState: "p95 400ms", afterState: "p95 520ms",
    summary: "Latency regressed after the change.", evidence: "Load test 901", recordedBy: "Performance Engineer",
  }, { updatedAt: "2026-10-19T12:20:00.000Z" });
  assert.equal(buildRemediationEffectivenessSummary(failed.finding).status, "failed");
  assert.equal(failed.finding.remediationVerification.status, "not-verified");
  assert.throws(() => confirmRemediationVerification(failed.findings, imported.findings[0].id, failed.run.id, {
    verifiedBy: "Release reviewer", rationale: "Cannot verify a failing test.",
  }), /only be verified from a passing/i);
});

test("a newer verification run invalidates a prior confirmation but keeps its history", () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview("verify-supersede.json"));
  const findingId = imported.findings[0].id;
  const pass = recordRemediationVerificationRun(imported.findings, findingId, {
    runType: "regression-test", outcome: "pass", beforeState: "Old behavior fails.", afterState: "Expected behavior observed.",
    summary: "Regression assertions passed.", evidence: "CI run 2010", recordedBy: "Engineer",
  }, { updatedAt: "2026-10-19T12:30:00.000Z" });
  const confirmed = confirmRemediationVerification(pass.findings, findingId, pass.run.id, {
    verifiedBy: "Reviewer", rationale: "Passing regression satisfies the issue acceptance criteria.",
  }, { updatedAt: "2026-10-19T12:31:00.000Z" });
  assert.equal(buildRemediationEffectivenessSummary(confirmed.finding).isVerified, true);
  const failed = recordRemediationVerificationRun(confirmed.findings, findingId, {
    runType: "monitoring", outcome: "fail", beforeState: "Stable behavior expected.", afterState: "Error rate exceeds target.",
    summary: "A later monitoring window detected recurring errors.", evidence: "Monitoring window 2026-10-19T12:40Z", recordedBy: "On-call Engineer",
  }, { updatedAt: "2026-10-19T12:41:00.000Z" });
  assert.equal(failed.finding.remediationVerification.status, "superseded");
  assert.equal(failed.finding.verificationRuns[0].reviewerVerifiedBy, "Reviewer");
  assert.ok(failed.finding.verificationRuns[0].verificationSupersededAt);
  assert.equal(buildRemediationEffectivenessSummary(failed.finding).status, "failed");
  assert.throws(() => confirmRemediationVerification(failed.findings, findingId, pass.run.id, {
    verifiedBy: "Reviewer", rationale: "Trying to reuse the older pass.",
  }), /latest verification run can be confirmed/i);
});

test("resolved findings without current effectiveness verification remain rollout blockers and are exported honestly", async () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview("resolved-not-verified.json"));
  const resolved = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "The code change was merged.", evidence: "Commit b821; CI run 2000",
  }, { updatedAt: "2026-10-19T12:50:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-remediation-effectiveness", owner: "Platform", rationale: "Confirm the fix before rollout." });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: resolved.findings })[0];
  const finding = saved.reviewFindings[0];
  const readinessCheck = buildRolloutReadiness(saved).checks.find((check) => check.id === `review-finding-remediation-verification-${finding.id}`);
  assert.equal(readinessCheck.state, "blocked", "error findings resolved by reviewer but not effectiveness-verified must still block rollout");
  assert.match(readinessCheck.detail, /evidence reference are reviewer records, not proof/i);
  assert.match(formatArchitectureDecisionRecordMarkdown(saved), /Remediation effectiveness:\*\* No verification run recorded/);
  const { buildReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundle.js");
  const { reviewReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundleReview.js");
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  assert.equal(bundle.decisionRecord.reviewFindings[0].remediationVerificationClassification, "not-currently-verified");
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /marked Resolved but do not have a current reviewer-confirmed/i.test(risk)));
  const reviewed = reviewReleaseEvidenceBundle(bundle, { sourceName: "remediation-unverified.json" });
  assert.ok(reviewed.findings.some((entry) => entry.code === `resolved-finding-effectiveness-unverified-0`));
});

test("a confirmed passing run clears the effectiveness gate and remains classified as a manual verification in exports", async () => {
  const imported = mergeReleaseBundleReviewFindings([], makeReview("verified-export.json"));
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, {
    status: "resolved", owner: "Platform", rationale: "The defect has been fixed in the candidate build.", evidence: "Change 820; CI run 2200",
  }, { updatedAt: "2026-10-19T12:55:00.000Z" });
  const run = recordRemediationVerificationRun(resolved.findings, findingId, {
    runType: "regression-test", outcome: "pass", beforeState: "The regression fails on the original build.",
    afterState: "The regression passes on the candidate build.", summary: "Executed the targeted regression on the proposed release.",
    evidence: "CI run 2210", recordedBy: "Test engineer",
  }, { updatedAt: "2026-10-19T12:56:00.000Z" });
  const verified = confirmRemediationVerification(run.findings, findingId, run.run.id, {
    verifiedBy: "Release reviewer", rationale: "The passing regression directly tests the reported behavior.",
  }, { updatedAt: "2026-10-19T12:57:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-verified-export", owner: "Platform", rationale: "Validate before production rollout." });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: verified.findings })[0];
  const finding = saved.reviewFindings.find((entry) => entry.id === findingId);
  assert.equal(buildRemediationEffectivenessSummary(finding).isVerified, true);
  assert.equal(buildRolloutReadiness(saved).checks.find((check) => check.id === `review-finding-remediation-verification-${findingId}`).state, "complete");
  const markdown = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(markdown, /Supporting evidence submitted/);
  assert.match(markdown, /Remediation verified by reviewer/);
  assert.match(markdown, /Before: The regression fails on the original build/);
  const { buildReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundle.js");
  const { reviewReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundleReview.js");
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  assert.equal(bundle.decisionRecord.reviewFindings.find((entry) => entry.id === findingId).remediationVerificationClassification, "manual-effectiveness-review");
  assert.equal(bundle.decisionRecord.reviewFindings.find((entry) => entry.id === findingId).verificationRuns[0].outcome, "pass");
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "verified-export.json" });
  assert.ok(review.findings.some((entry) => entry.code === `remediation-verification-manual-0`), "review makes the manual-attestation limitation explicit");
});

test("reviewer-confirmed effectiveness persists in the decision record and a recurrence supersedes it without erasing history", () => {
  const first = { ...makeReview("verify-recurrence-a.json"), bundleMetadata: { recordId: "adr-verify-recurrence", generatedAt: "2026-10-19T13:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], first, { importedAt: "2026-10-19T13:01:00.000Z" });
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, {
    status: "resolved", owner: "Platform", rationale: "Fix was deployed to the test environment.", evidence: "Change 741",
  }, { updatedAt: "2026-10-19T13:02:00.000Z" });
  const run = recordRemediationVerificationRun(resolved.findings, findingId, {
    runType: "regression-test", outcome: "pass", beforeState: "Assertion failed before patch.", afterState: "Assertion passes after patch.",
    summary: "Regression test on patched branch.", evidence: "CI run 2110", recordedBy: "Engineer",
  }, { updatedAt: "2026-10-19T13:03:00.000Z" });
  const confirmed = confirmRemediationVerification(run.findings, findingId, run.run.id, {
    verifiedBy: "Release reviewer", rationale: "Regression run directly covers the reported issue.",
  }, { updatedAt: "2026-10-19T13:04:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-verify-recurrence", owner: "Platform", rationale: "Review repeated evidence." });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: confirmed.findings })[0];
  const later = mergeReleaseBundleReviewFindings(saved.reviewFindings, {
    ...makeReview("verify-recurrence-b.json"), bundleMetadata: { recordId: "adr-verify-recurrence", generatedAt: "2026-10-19T13:05:00.000Z" },
  }, { importedAt: "2026-10-19T13:06:00.000Z" });
  const recurring = later.findings.find((entry) => entry.id === findingId);
  assert.equal(recurring.remediationVerification.status, "superseded");
  assert.equal(recurring.verificationRuns[0].reviewerVerifiedBy, "Release reviewer");
  assert.ok(recurring.verificationRuns[0].verificationSupersededReason.includes("reappeared"));
  assert.equal(buildRemediationEffectivenessSummary(recurring).isVerified, false);
  assert.equal(buildReviewFindingObservationTimeline(recurring).timeline.length, 2);
  assert.ok(recurring.auditTrail.some((event) => event.type === "remediation-verification-superseded"));
});

test("observation timeline compares changed severity, title, and detail across release bundles", () => {
  const initial = { sourceName: "rel-1.json", bundleMetadata: { recordId: "adr-timeline", generatedAt: "2026-10-19T13:00:00.000Z" }, findings: [
    { code: "schema-drift", severity: "warning", title: "Schema differs", detail: "Column count differs." },
  ] };
  const imported = mergeReleaseBundleReviewFindings([], initial, { importedAt: "2026-10-19T13:01:00.000Z" });
  const originalId = imported.findings[0].id;
  const nextRelease = { sourceName: "rel-2.json", bundleMetadata: { recordId: "adr-timeline", generatedAt: "2026-10-19T13:05:00.000Z" }, findings: [
    { code: "schema-drift", severity: "error", title: "Schema mismatch", detail: "The column count and nullability both differ." },
  ] };
  const merged = mergeReleaseBundleReviewFindings(imported.findings, nextRelease, { importedAt: "2026-10-19T13:06:00.000Z" });
  assert.equal(merged.added, 0, "a changed observation should not fork a uniquely coded finding into a new record");
  assert.equal(merged.findings.length, 1);
  assert.equal(merged.findings[0].id, originalId);
  assert.equal(merged.findings[0].severity, "error");
  const timeline = buildReviewFindingObservationTimeline(merged.findings[0]);
  assert.equal(timeline.timeline.length, 2);
  assert.equal(timeline.previous.findingSnapshot.detail, "Column count differs.");
  assert.equal(timeline.latest.findingSnapshot.detail, "The column count and nullability both differ.");
  assert.deepEqual(timeline.changes.map((change) => change.field), ["severity", "title", "detail"]);
  assert.ok(merged.findings[0].auditTrail.some((event) => event.type === "finding-details-changed"));
});

test("reopening a finding requires new evidence before it can close again", () => {
  const first = { ...makeReview("fresh-1.json"), bundleMetadata: { recordId: "adr-fresh-evidence", generatedAt: "2026-10-19T14:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], first, { importedAt: "2026-10-19T14:01:00.000Z" });
  const closed = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "Original finding remediated.", evidence: "CI run 1200 passed",
  }, { updatedAt: "2026-10-19T14:02:00.000Z" });
  const later = mergeReleaseBundleReviewFindings(closed.findings, {
    ...makeReview("fresh-2.json"), bundleMetadata: { recordId: "adr-fresh-evidence", generatedAt: "2026-10-19T14:05:00.000Z" },
  }, { importedAt: "2026-10-19T14:06:00.000Z" });
  const reopened = reopenTrackedReviewFinding(later.findings, later.findings[0].id, { updatedAt: "2026-10-19T14:07:00.000Z" });
  assert.equal(reopened.finding.freshEvidenceRequired, true);
  assert.equal(reopened.finding.evidence, "");
  assert.equal(reopened.finding.previousEvidence, "CI run 1200 passed");
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-fresh-evidence-guard", owner: "Platform", rationale: "Prevent stale evidence reuse." });
  const savedOpen = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: reopened.findings })[0];
  assert.throws(() => updateArchitectureDecisionRecords([savedOpen], record.id, { reviewFindings: [{
    ...reopened.finding, status: "resolved", evidence: "CI run 1200 passed", freshEvidenceRequired: false, freshEvidenceAt: null,
    owner: "Platform", rationale: "Attempt with stale reference.",
  }] }), /requires fresh supporting evidence/i, "the persisted document API must reject attempts to bypass the fresh-evidence gate");
  assert.throws(() => updateTrackedReviewFinding(reopened.findings, reopened.finding.id, {
    status: "resolved", owner: "Platform", rationale: "Still good.", evidence: "CI run 1200 passed",
  }, { updatedAt: "2026-10-19T14:08:00.000Z" }), /fresh and different/i);
  assert.throws(() => updateTrackedReviewFinding(reopened.findings, reopened.finding.id, {
    status: "resolved", owner: "Platform", rationale: "Still good.",
  }, { updatedAt: "2026-10-19T14:08:00.000Z" }), /fresh supporting evidence/i);
  const fresh = updateTrackedReviewFinding(reopened.findings, reopened.finding.id, {
    evidence: "CI run 1224 passed after recurrence",
  }, { updatedAt: "2026-10-19T14:09:00.000Z" });
  assert.equal(fresh.finding.freshEvidenceRequired, false);
  assert.equal(fresh.finding.freshEvidenceAt, "2026-10-19T14:09:00.000Z");
  assert.equal(fresh.finding.freshEvidenceRequestedAt, "2026-10-19T14:07:00.000Z", "the request timestamp remains available for subsequent verification chronology checks");
  assert.ok(fresh.finding.auditTrail.some((event) => event.type === "fresh-evidence-recorded"));
  const resolved = updateTrackedReviewFinding(fresh.findings, fresh.finding.id, {
    status: "resolved", owner: "Platform", rationale: "Recurrence passed fresh validation.", evidence: fresh.finding.evidence,
  }, { updatedAt: "2026-10-19T14:10:00.000Z" });
  assert.equal(resolved.finding.status, "resolved");
});

test("a reopened finding cannot be verified with a run timestamped before reopening", () => {
  const first = { ...makeReview("verify-after-reopen-1.json"), bundleMetadata: { recordId: "adr-run-chronology", generatedAt: "2026-10-19T14:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], first, { importedAt: "2026-10-19T14:01:00.000Z" });
  const closed = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "Initial validation passed.", evidence: "CI run 2401",
  }, { updatedAt: "2026-10-19T14:02:00.000Z" });
  const later = mergeReleaseBundleReviewFindings(closed.findings, {
    ...makeReview("verify-after-reopen-2.json"), bundleMetadata: { recordId: "adr-run-chronology", generatedAt: "2026-10-19T14:05:00.000Z" },
  }, { importedAt: "2026-10-19T14:06:00.000Z" });
  const reopened = reopenTrackedReviewFinding(later.findings, later.findings[0].id, { updatedAt: "2026-10-19T14:07:00.000Z" });
  assert.throws(() => recordRemediationVerificationRun(reopened.findings, reopened.finding.id, {
    runType: "regression-test", outcome: "pass", beforeState: "Failure before patch.", afterState: "Pass observed.",
    summary: "Run predates the re-open event.", evidence: "CI run 2402", recordedBy: "Engineer",
  }, { updatedAt: "2026-10-19T14:06:30.000Z" }), /recorded after the finding was reopened/i);
});

test("decision record, readiness, and release export preserve observation timeline and fresh-evidence gate", async () => {
  const first = { ...makeReview("snapshot-1.json"), bundleMetadata: { recordId: "adr-snapshot-fresh", generatedAt: "2026-10-19T15:00:00.000Z" } };
  const imported = mergeReleaseBundleReviewFindings([], first, { importedAt: "2026-10-19T15:01:00.000Z" });
  const closed = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    status: "accepted-risk", owner: "SRE", rationale: "Initially monitored.", evidence: "Risk ticket RK-1",
  }, { updatedAt: "2026-10-19T15:02:00.000Z" });
  const later = mergeReleaseBundleReviewFindings(closed.findings, {
    ...makeReview("snapshot-2.json"), bundleMetadata: { recordId: "adr-snapshot-fresh", generatedAt: "2026-10-19T15:05:00.000Z" },
  }, { importedAt: "2026-10-19T15:06:00.000Z" });
  const reopened = reopenTrackedReviewFinding(later.findings, later.findings[0].id, { updatedAt: "2026-10-19T15:07:00.000Z" });
  const record = createArchitectureDecisionRecord({ report: sampleReport(), id: "adr-snapshot-fresh", owner: "Platform", rationale: "Verify reoccurrence" });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: reopened.findings })[0];
  assert.ok(buildRolloutReadiness(saved).checks.some((check) => check.id === `review-finding-fresh-evidence-${reopened.finding.id}`));
  assert.match(formatArchitectureDecisionRecordMarkdown(saved), /Observation timeline/);
  assert.match(formatArchitectureDecisionRecordMarkdown(saved), /Fresh evidence required/);
  const { buildReleaseEvidenceBundle } = await import("../src/features/simulation/experiments/releaseEvidenceBundle.js");
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  assert.equal(bundle.decisionRecord.reviewFindings[0].freshEvidenceRequired, true);
  assert.equal(bundle.decisionRecord.reviewFindings[0].sourceBundleObservations.length, 2);
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /require fresh supporting evidence/i.test(risk)));
});


test("importing an older bundle later does not trigger a false reoccurrence or replace latest details", () => {
  const first = { sourceName: "release-a.json", bundleMetadata: { recordId: "adr-chronology", generatedAt: "2026-10-19T16:00:00.000Z" }, findings: [
    { code: "drift", severity: "warning", title: "Configuration drift", detail: "Initial version." },
  ] };
  const initial = mergeReleaseBundleReviewFindings([], first, { importedAt: "2026-10-19T16:01:00.000Z" });
  const later = mergeReleaseBundleReviewFindings(initial.findings, {
    sourceName: "release-c.json", bundleMetadata: { recordId: "adr-chronology", generatedAt: "2026-10-19T16:10:00.000Z" }, findings: [
      { code: "drift", severity: "error", title: "Configuration drift", detail: "Latest observed detail." },
    ],
  }, { importedAt: "2026-10-19T16:11:00.000Z" });
  const closed = updateTrackedReviewFinding(later.findings, later.findings[0].id, {
    status: "resolved", owner: "Platform", rationale: "Latest known issue fixed.", evidence: "CI run 1330",
  }, { updatedAt: "2026-10-19T16:12:00.000Z" });
  const historical = mergeReleaseBundleReviewFindings(closed.findings, {
    sourceName: "release-b.json", bundleMetadata: { recordId: "adr-chronology", generatedAt: "2026-10-19T16:05:00.000Z" }, findings: [
      { code: "drift", severity: "warning", title: "Configuration drift", detail: "Historical middle version." },
    ],
  }, { importedAt: "2026-10-19T16:20:00.000Z" });
  assert.equal(historical.reoccurrencesDetected, 0);
  assert.equal(historical.findings[0].reoccurrence, null);
  assert.equal(historical.findings[0].detail, "Latest observed detail.");
  const timeline = buildReviewFindingObservationTimeline(historical.findings[0]);
  assert.deepEqual(timeline.timeline.map((entry) => entry.sourceName), ["release-a.json", "release-b.json", "release-c.json"]);
  assert.equal(timeline.latest.findingSnapshot.detail, "Latest observed detail.");
  assert.ok(historical.findings[0].auditTrail.some((event) => event.type === "historical-observation-imported"));
});
