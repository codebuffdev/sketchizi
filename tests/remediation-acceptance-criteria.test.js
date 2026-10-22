import test from "node:test";
import assert from "node:assert/strict";
import { getRemediationAcceptanceMetricDefinitions, normalizeRemediationAcceptanceCriteria, evaluateRemediationAcceptanceCriteria, validateRemediationAcceptanceCriteria } from "../src/features/simulation/experiments/remediationAcceptanceCriteria.js";
import { buildRemediationEffectivenessSummary, confirmRemediationVerification, mergeReleaseBundleReviewFindings, recordRemediationVerificationRun, updateTrackedReviewFinding } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecords } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildRolloutReadiness } from "../src/features/simulation/experiments/rolloutReadiness.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";
import { readFile } from "node:fs/promises";
import { createWorkbenchExtension, withWorkbenchExtension, readWorkbenchDocument } from "../src/features/workbench/workbenchDocument.js";
import { formatArchitectureDecisionRecordMarkdown } from "../src/features/simulation/experiments/architectureDecisionRecord.js";

function sampleReview(name = "acceptance-bundle.json") {
  return {
    sourceName: name,
    bundleMetadata: { recordId: "adr-quantitative-acceptance", generatedAt: "2026-10-19T14:00:00.000Z" },
    findings: [{ code: "latency-regression", severity: "error", title: "p95 latency exceeds the target", detail: "Latency regressed under concurrent traffic." }],
  };
}

function configureCriteria(findings, id, targets = {}) {
  return updateTrackedReviewFinding(findings, id, { acceptanceCriteria: targets }, { updatedAt: "2026-10-19T14:01:00.000Z" });
}

function passingMeasurements() {
  return {
    p95LatencyMs: { before: 300, after: 180 },
    throughputRps: { before: 80, after: 125 },
    errorRatePercent: { before: 4, after: 0.5 },
    successRatePercent: { before: 96, after: 99.5 },
  };
}

function sourceMappingsFor(measurements, prefix = "Acceptance report") {
  return Object.fromEntries(Object.entries(measurements || {}).map(([metricKey, sides]) => [metricKey, Object.fromEntries(["before", "after"].filter((side) => sides?.[side] !== "" && sides?.[side] !== null && sides?.[side] !== undefined && Number.isFinite(Number(sides?.[side]))).map((side) => [side, {
    sourceType: "report-field", evidenceReference: `${prefix} ${side}`, sourceField: `measurements.${metricKey}.${side}`, sourceValue: Number(sides[side]),
  }]))]));
}

function recordRun(findings, id, { outcome = "pass", measurements = passingMeasurements(), evidence = "CI run 0.92-42", updatedAt = "2026-10-19T14:02:00.000Z" } = {}) {
  return recordRemediationVerificationRun(findings, id, {
    runType: "regression-test", outcome,
    beforeState: "The baseline build breaches at least one target.",
    afterState: "The candidate build was measured against the saved acceptance targets.",
    summary: "Compared numeric baseline and candidate measurements.", evidence, recordedBy: "Verification engineer", measurements,
    measurementSources: sourceMappingsFor(measurements),
  }, { updatedAt });
}

const criteria = { p95LatencyMs: 200, throughputRps: 100, errorRatePercent: 1, successRatePercent: 99 };

test("acceptance targets normalize known numeric metrics and reject invalid target ranges", () => {
  assert.deepEqual(normalizeRemediationAcceptanceCriteria({ p95LatencyMs: "200", errorRatePercent: 1, unknown: 9, successRatePercent: 101 }), {
    p95LatencyMs: 200, errorRatePercent: 1,
  });
  assert.throws(() => validateRemediationAcceptanceCriteria({ errorRatePercent: 101 }), /valid error rate target/i);
  assert.throws(() => validateRemediationAcceptanceCriteria({ unsupportedMetric: 4 }), /unsupported acceptance metric/i);
  assert.throws(() => validateRemediationAcceptanceCriteria({ p95LatencyMs: " " }), /valid p95 latency target/i);
  assert.throws(() => validateRemediationAcceptanceCriteria({ throughputRps: true }), /valid throughput target/i);
  assert.equal(getRemediationAcceptanceMetricDefinitions().length, 4);
});

test("numeric criteria compare after measurements with directional targets and preserve before/after deltas", () => {
  const result = evaluateRemediationAcceptanceCriteria(criteria, passingMeasurements());
  assert.equal(result.status, "pass");
  assert.equal(result.criteriaCount, 4);
  assert.equal(result.passedCount, 4);
  assert.equal(result.criteria.find((row) => row.key === "p95LatencyMs").delta, -120);
  assert.equal(result.criteria.find((row) => row.key === "throughputRps").delta, 45);

  const failing = evaluateRemediationAcceptanceCriteria(criteria, {
    p95LatencyMs: { before: 300, after: 230 },
    throughputRps: { before: 80, after: 125 },
    errorRatePercent: { before: 4, after: 2 },
    successRatePercent: { before: 96, after: "" },
  });
  assert.equal(failing.status, "fail", "any failed numeric target fails the acceptance evaluation");
  assert.equal(failing.failedCount, 2);
  assert.equal(failing.unevaluatedCount, 1);
  assert.equal(failing.criteria.find((row) => row.key === "successRatePercent").state, "unevaluated");
});

test("missing after values remain unevaluated and do not count as a pass", () => {
  const result = evaluateRemediationAcceptanceCriteria({ p95LatencyMs: 200, throughputRps: 100 }, {
    p95LatencyMs: { before: 260, after: 180 }, throughputRps: { before: 80 },
  });
  assert.equal(result.status, "incomplete");
  assert.equal(result.passedCount, 1);
  assert.equal(result.unevaluatedCount, 1);
});

test("configured targets and numeric run values persist as a point-in-time acceptance snapshot", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const savedCriteria = configureCriteria(imported.findings, id, criteria);
  const recorded = recordRun(savedCriteria.findings, id);
  assert.deepEqual(recorded.run.acceptanceCriteriaSnapshot, criteria);
  assert.equal(recorded.run.acceptanceEvaluation.status, "pass");
  assert.deepEqual(recorded.run.measurements.p95LatencyMs, { before: 300, after: 180 });
  assert.equal(buildRemediationEffectivenessSummary(recorded.finding).status, "awaiting-confirmation");
});

test("reviewer cannot confirm a user-declared Pass when a numeric acceptance target fails", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const savedCriteria = configureCriteria(imported.findings, id, criteria);
  const failed = recordRun(savedCriteria.findings, id, { measurements: {
    p95LatencyMs: { before: 300, after: 180 }, throughputRps: { before: 80, after: 125 },
    errorRatePercent: { before: 4, after: 2 }, successRatePercent: { before: 96, after: 99.5 },
  } });
  assert.equal(failed.run.outcome, "pass", "the test/run declaration is retained separately from numeric acceptance evaluation");
  assert.equal(buildRemediationEffectivenessSummary(failed.finding).status, "criteria-failed");
  assert.throws(() => confirmRemediationVerification(failed.findings, id, failed.run.id, {
    verifiedBy: "Release reviewer", rationale: "The run was green.",
  }), /quantitative acceptance criteria are fail/i);
});

test("incomplete numeric measurements require a new complete run before confirmation", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const savedCriteria = configureCriteria(imported.findings, id, criteria);
  const run = recordRun(savedCriteria.findings, id, { measurements: { p95LatencyMs: { before: 300, after: 180 } } });
  assert.equal(buildRemediationEffectivenessSummary(run.finding).status, "criteria-incomplete");
  assert.throws(() => confirmRemediationVerification(run.findings, id, run.run.id, {
    verifiedBy: "Reviewer", rationale: "Need all defined targets measured.",
  }), /quantitative acceptance criteria are incomplete/i);
});

test("a passing quantitative run can be reviewer-confirmed and satisfy the verification gate", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const closed = updateTrackedReviewFinding(imported.findings, id, {
    status: "resolved", owner: "Platform", rationale: "The candidate build includes the fix.", evidence: "Change 0.92-42",
  });
  const savedCriteria = configureCriteria(closed.findings, id, criteria);
  const run = recordRun(savedCriteria.findings, id);
  const verified = confirmRemediationVerification(run.findings, id, run.run.id, {
    verifiedBy: "Release reviewer", rationale: "All current numeric targets pass on the candidate run.",
  }, { updatedAt: "2026-10-19T14:03:00.000Z" });
  assert.equal(buildRemediationEffectivenessSummary(verified.finding).isVerified, true);
  const record = createArchitectureDecisionRecord({ report: { title: "Decision", risks: [], limitations: [] }, id: "adr-criteria-gate", owner: "Platform", rationale: "Hold rollout until measured targets pass." });
  const withFinding = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: verified.findings })[0];
  const check = buildRolloutReadiness(withFinding).checks.find((item) => item.id === `review-finding-remediation-verification-${id}`);
  assert.equal(check.state, "complete");
});

test("changing acceptance targets invalidates existing confirmation and requires a new run", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const savedCriteria = configureCriteria(imported.findings, id, criteria);
  const run = recordRun(savedCriteria.findings, id);
  const verified = confirmRemediationVerification(run.findings, id, run.run.id, {
    verifiedBy: "Reviewer", rationale: "Initial thresholds were satisfied.",
  });
  const stricter = updateTrackedReviewFinding(verified.findings, id, { acceptanceCriteria: { ...criteria, p95LatencyMs: 150 } }, {
    updatedAt: "2026-10-19T14:04:00.000Z",
  });
  const summary = buildRemediationEffectivenessSummary(stricter.finding);
  assert.equal(summary.isVerified, false);
  assert.equal(summary.status, "criteria-not-evaluated");
  assert.equal(stricter.finding.remediationVerification.status, "superseded");
  assert.ok(stricter.finding.auditTrail.some((event) => event.type === "verification-reassessment-required"));
});

test("clearing or changing criteria cannot reuse a run recorded against prior targets", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const savedCriteria = configureCriteria(imported.findings, id, criteria);
  const run = recordRun(savedCriteria.findings, id);
  const cleared = updateTrackedReviewFinding(run.findings, id, { acceptanceCriteria: {} }, { updatedAt: "2026-10-19T14:03:00.000Z" });
  assert.equal(buildRemediationEffectivenessSummary(cleared.finding).status, "criteria-not-evaluated");
  assert.throws(() => confirmRemediationVerification(cleared.findings, id, run.run.id, {
    verifiedBy: "Reviewer", rationale: "Old run should not confirm after the criteria were cleared.",
  }), /acceptance criteria changed after this run/i);
});

test("acceptance criteria and observed numeric results persist to the document and export bundle", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const configured = configureCriteria(imported.findings, id, criteria);
  const run = recordRun(configured.findings, id);
  const record = createArchitectureDecisionRecord({ report: { title: "Decision", risks: [], limitations: [] }, id: "adr-criteria-export", owner: "Platform", rationale: "Validate measured thresholds." });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: run.findings })[0];
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  const exportedFinding = bundle.decisionRecord.reviewFindings[0];
  assert.deepEqual(exportedFinding.acceptanceCriteria, criteria);
  assert.equal(exportedFinding.verificationRuns[0].acceptanceEvaluation.status, "pass");
  assert.deepEqual(exportedFinding.verificationRuns[0].measurements.p95LatencyMs, { before: 300, after: 180 });
  const markdown = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(markdown, /Quantitative acceptance criteria/);
  assert.match(markdown, /p95LatencyMs = 200/);
  assert.match(markdown, /Quantitative acceptance evaluation:\*\* pass/);
  const workbench = createWorkbenchExtension({ activeViewId: "system", views: [{ id: "system", label: "System", description: "System" }], entities: [], relations: [], viewScenes: {} });
  workbench.decisionRecords = [saved];
  const loaded = readWorkbenchDocument({ elements: [], appState: {}, files: {}, extensions: withWorkbenchExtension({}, workbench) });
  assert.deepEqual(loaded.workbench.decisionRecords[0].reviewFindings[0].acceptanceCriteria, criteria);
  assert.deepEqual(loaded.workbench.decisionRecords[0].reviewFindings[0].verificationRuns[0].measurements.p95LatencyMs, { before: 300, after: 180 });
});

test("bundle review recomputes quantitative acceptance rather than trusting a stored pass summary", () => {
  const imported = mergeReleaseBundleReviewFindings([], sampleReview(), { importedAt: "2026-10-19T14:00:00.000Z" });
  const id = imported.findings[0].id;
  const configured = configureCriteria(imported.findings, id, criteria);
  const run = recordRun(configured.findings, id, { measurements: {
    p95LatencyMs: { before: 300, after: 180 }, throughputRps: { before: 80, after: 125 },
    errorRatePercent: { before: 4, after: 2 }, successRatePercent: { before: 96, after: 99.5 },
  } });
  const record = createArchitectureDecisionRecord({ report: { title: "Decision", risks: [], limitations: [] }, id: "adr-criteria-review", owner: "Platform", rationale: "Review numeric evidence." });
  const saved = updateArchitectureDecisionRecords([record], record.id, { reviewFindings: run.findings })[0];
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: [] });
  bundle.decisionRecord.reviewFindings[0].verificationRuns[0].acceptanceEvaluation = {
    status: "pass", criteriaCount: 4, evaluatedCount: 4, passedCount: 4, failedCount: 0, unevaluatedCount: 0,
  };
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "acceptance-tampered.json" });
  assert.ok(review.findings.some((finding) => finding.code === "review-finding-acceptance-evaluation-mismatch-0-0"));
  assert.ok(review.findings.some((finding) => finding.code === "review-finding-acceptance-not-met-0-0" && finding.severity === "error"));
});

test("panel surfaces quantitative targets, before/after measurement fields, and criterion status", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Quantitative acceptance criteria/);
  assert.match(panel, /Numeric before \/ after measurements/);
  assert.match(panel, /Acceptance result:/);
  assert.match(panel, /Record verification run/);
  assert.match(panel, /Confirm remediation verified/);
});
