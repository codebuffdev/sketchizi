import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureRemediationMeasurementSources, evaluateRemediationMeasurementSourceDrift, evaluateRemediationMeasurementSources, getLoadTestSourceMetric } from "../src/features/simulation/experiments/remediationEvidenceMapping.js";
import { buildRemediationEffectivenessSummary, mergeReleaseBundleReviewFindings, recordRemediationVerificationRun, confirmRemediationVerification, updateTrackedReviewFinding } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecords, formatArchitectureDecisionRecordMarkdown } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { buildRolloutReadiness } from "../src/features/simulation/experiments/rolloutReadiness.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";

const records = [
  { id: "lt-before", name: "Before remediation load test", testedAt: "2026-10-01", targetEnvironment: "staging-a", source: "k6", workload: { offeredRps: 150 }, observed: { p95LatencyMs: 300, throughputRps: 80, errorRatePercent: 4 } },
  { id: "lt-after", name: "After remediation load test", testedAt: "2026-10-02", targetEnvironment: "staging-a", source: "k6", workload: { offeredRps: 150 }, observed: { p95LatencyMs: 180, throughputRps: 125, errorRatePercent: 0.5 } },
];
function reviewFixture(sourceName = "mapped-run.json") {
  return {
    sourceName,
    bundleMetadata: { recordId: "adr-evidence-source-map", generatedAt: "2026-10-03T10:00:00.000Z" },
    findings: [{ code: "latency-regression", severity: "error", title: "p95 latency exceeds target", detail: "p95 latency exceeds 200ms under sustained load." }],
  };
}
function runInput({ measurementSources, measurements = { p95LatencyMs: { before: 300, after: 180 } } } = {}) {
  return {
    runType: "load-test", outcome: "pass", beforeState: "p95 exceeds target.", afterState: "p95 is within target.",
    summary: "Compared before/after load-test measurements.", evidence: "k6 report 101 / 102", recordedBy: "Performance engineer",
    measurements, measurementSources,
  };
}
function loadTestSources() {
  return {
    p95LatencyMs: {
      before: { sourceType: "load-test-record", sourceRecordId: "lt-before" },
      after: { sourceType: "load-test-record", sourceRecordId: "lt-after" },
    },
  };
}
function reportSources(before = 300, after = 180) {
  return {
    p95LatencyMs: {
      before: { sourceType: "report-field", evidenceReference: "Performance Report PERF-101", sourceField: "latency.p95.beforeMs", sourceValue: before },
      after: { sourceType: "evidence-reference", evidenceReference: "https://example.invalid/reports/PERF-102", sourceField: "results.latency.p95Ms", sourceValue: after },
    },
  };
}
function newSavedRecord(findings, id = "adr-evidence-source-map") {
  const record = createArchitectureDecisionRecord({
    id, owner: "Platform", rationale: "Trace remediation numbers to their source records.",
    report: { title: "Decision", risks: [], limitations: [], simulationStatus: "comparable", metrics: [], loadTestRecordsCount: records.length },
  });
  return updateArchitectureDecisionRecords([record], id, { reviewFindings: findings })[0];
}

test("saved load-test record mappings snapshot actual fields and derived success rate transparently", () => {
  const measurements = {
    p95LatencyMs: { before: 300, after: 180 },
    throughputRps: { before: 80, after: 125 },
    errorRatePercent: { before: 4, after: 0.5 },
    successRatePercent: { before: 96, after: 99.5 },
  };
  const sources = {
    p95LatencyMs: { before: { sourceType: "load-test-record", sourceRecordId: "lt-before" }, after: { sourceType: "load-test-record", sourceRecordId: "lt-after" } },
    throughputRps: { before: { sourceType: "load-test-record", sourceRecordId: "lt-before" }, after: { sourceType: "load-test-record", sourceRecordId: "lt-after" } },
    errorRatePercent: { before: { sourceType: "load-test-record", sourceRecordId: "lt-before" }, after: { sourceType: "load-test-record", sourceRecordId: "lt-after" } },
    successRatePercent: { before: { sourceType: "load-test-record", sourceRecordId: "lt-before" }, after: { sourceType: "load-test-record", sourceRecordId: "lt-after" } },
  };
  const captured = captureRemediationMeasurementSources(sources, measurements, records);
  assert.equal(captured.evaluation.status, "complete");
  assert.equal(captured.sources.p95LatencyMs.before.sourceField, "observed.p95LatencyMs");
  assert.equal(captured.sources.p95LatencyMs.before.sourceValue, 300);
  assert.equal(captured.sources.successRatePercent.before.sourceValue, 96);
  assert.equal(captured.sources.successRatePercent.before.transformation, "100 - observed.errorRatePercent");
  assert.equal(captured.sources.successRatePercent.before.independentlyVerified, false);
  assert.equal(getLoadTestSourceMetric(records[0], "p95LatencyMs").value, 300);
});

test("source-drift monitor recognizes unchanged source snapshots and preserves their original values", () => {
  const measurements = { p95LatencyMs: { before: 300, after: 180 } };
  const captured = captureRemediationMeasurementSources(loadTestSources(), measurements, records);
  const originalSnapshot = structuredClone(captured.sources.p95LatencyMs.before.sourceSnapshot);
  const unchanged = evaluateRemediationMeasurementSourceDrift(captured.sources, records);
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.sourceCount, 2);
  assert.equal(unchanged.unchangedCount, 2);
  assert.equal(unchanged.items.every((item) => item.state === "unchanged"), true);

  const changedRecords = structuredClone(records);
  changedRecords[0].observed.p95LatencyMs = 285;
  changedRecords[0].targetEnvironment = "staging-b";
  changedRecords[0].workload.offeredRps = 175;
  const changed = evaluateRemediationMeasurementSourceDrift(captured.sources, changedRecords);
  assert.equal(changed.status, "drift-detected");
  const beforeRow = changed.items.find((item) => item.sourceRecordId === "lt-before");
  assert.ok(beforeRow.changes.some((change) => change.type === "value-changed"));
  assert.ok(beforeRow.changes.some((change) => change.type === "metadata-changed"));
  assert.ok(beforeRow.changes.some((change) => change.type === "workload-changed"));
  assert.deepEqual(captured.sources.p95LatencyMs.before.sourceSnapshot, originalSnapshot, "evaluating drift must not replace the saved original source snapshot");
});

test("source-drift monitor detects missing records and field-definition changes", () => {
  const captured = captureRemediationMeasurementSources(loadTestSources(), { p95LatencyMs: { before: 300, after: 180 } }, records);
  const missing = evaluateRemediationMeasurementSourceDrift(captured.sources, [records[1]]);
  assert.equal(missing.status, "drift-detected");
  assert.equal(missing.missingSourceCount, 1);
  assert.equal(missing.items.find((item) => item.sourceRecordId === "lt-before").state, "missing-source");

  const changedDefinitionSources = structuredClone(captured.sources);
  changedDefinitionSources.p95LatencyMs.before.sourceSnapshot.fieldDefinition.label = "p95 latency with changed definition";
  const changedDefinition = evaluateRemediationMeasurementSourceDrift(changedDefinitionSources, records);
  const before = changedDefinition.items.find((item) => item.sourceRecordId === "lt-before");
  assert.equal(changedDefinition.status, "drift-detected");
  assert.ok(before.changes.some((change) => change.type === "field-definition-changed"));
});

test("legacy source mappings are flagged when their snapshot is too incomplete to prove stability", () => {
  const captured = captureRemediationMeasurementSources(loadTestSources(), { p95LatencyMs: { before: 300, after: 180 } }, records);
  const legacy = structuredClone(captured.sources);
  delete legacy.p95LatencyMs.before.sourceSnapshot;
  delete legacy.p95LatencyMs.after.sourceSnapshot;
  const drift = evaluateRemediationMeasurementSourceDrift(legacy, records);
  assert.equal(drift.status, "snapshot-incomplete");
  assert.equal(drift.snapshotIncompleteCount, 2);
  assert.equal(drift.items.every((item) => item.state === "snapshot-incomplete"), true);
});

test("report-field and evidence-reference links require matching source values", () => {
  const measurements = { p95LatencyMs: { before: 300, after: 180 } };
  const complete = captureRemediationMeasurementSources(reportSources(), measurements, []);
  assert.equal(complete.evaluation.status, "complete");
  assert.equal(complete.evaluation.linkedCount, 2);
  const inconsistent = captureRemediationMeasurementSources(reportSources(290, 181), measurements, []);
  assert.equal(inconsistent.evaluation.status, "inconsistent");
  assert.equal(inconsistent.evaluation.mismatchCount, 2);
  assert.match(inconsistent.evaluation.items.find((item) => item.side === "before").detail, /does not match recorded measurement/);
});

test("missing mappings are incomplete and mappings without measurements are orphaned", () => {
  const unlinked = evaluateRemediationMeasurementSources({ p95LatencyMs: { before: 300, after: 180 } }, {});
  assert.equal(unlinked.status, "incomplete");
  assert.equal(unlinked.unlinkedCount, 2);
  const orphaned = evaluateRemediationMeasurementSources({ p95LatencyMs: { before: 300, after: null } }, {
    p95LatencyMs: { before: { sourceType: "report-field", evidenceReference: "Report R-1", sourceField: "p95.before", sourceValue: 300 }, after: { sourceType: "report-field", evidenceReference: "Report R-1", sourceField: "p95.after", sourceValue: 180 } },
  });
  assert.equal(orphaned.status, "inconsistent");
  assert.equal(orphaned.items.find((item) => item.side === "after").state, "orphaned");
});

test("load-test source mappings flag a record missing from or changed in the release bundle", () => {
  const measurements = { p95LatencyMs: { before: 300, after: 180 } };
  const captured = captureRemediationMeasurementSources(loadTestSources(), measurements, records);
  assert.equal(evaluateRemediationMeasurementSources(measurements, captured.sources, { loadTestRecords: records }).status, "complete");
  assert.equal(evaluateRemediationMeasurementSources(measurements, captured.sources, { loadTestRecords: [records[1]] }).status, "incomplete");
  const changed = [{ ...records[0], observed: { ...records[0].observed, p95LatencyMs: 290 } }, records[1]];
  assert.equal(evaluateRemediationMeasurementSources(measurements, captured.sources, { loadTestRecords: changed }).status, "inconsistent");
});

test("reviewer cannot confirm quantitative remediation while any measurement source is unmapped or inconsistent", () => {
  const imported = mergeReleaseBundleReviewFindings([], reviewFixture());
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, { status: "resolved", owner: "Platform", rationale: "Fix applied.", evidence: "CI 102" });
  const unmapped = recordRemediationVerificationRun(resolved.findings, findingId, runInput(), { updatedAt: "2026-10-03T10:02:00.000Z" });
  assert.equal(unmapped.finding.remediationVerification.status, "not-verified");
  assert.equal(unmapped.finding.verificationRuns[0].measurementSourceEvaluation.status, "incomplete");
  assert.throws(() => confirmRemediationVerification(unmapped.findings, findingId, unmapped.run.id, { verifiedBy: "Reviewer", rationale: "Pass is recorded." }), /measurement source mappings are incomplete/i);

  const inconsistent = recordRemediationVerificationRun(resolved.findings, findingId, runInput({ measurementSources: reportSources(295, 180) }), { updatedAt: "2026-10-03T10:03:00.000Z" });
  assert.equal(inconsistent.run.measurementSourceEvaluation.status, "inconsistent");
  assert.throws(() => confirmRemediationVerification(inconsistent.findings, findingId, inconsistent.run.id, { verifiedBy: "Reviewer", rationale: "Need aligned values." }), /measurement source mappings are inconsistent/i);
});

test("untraceable numeric runs keep resolved findings blocked and appear in exported risks", () => {
  const imported = mergeReleaseBundleReviewFindings([], reviewFixture());
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, { status: "resolved", owner: "Platform", rationale: "Fix applied.", evidence: "CI 103" });
  const unlinked = recordRemediationVerificationRun(resolved.findings, findingId, runInput(), { updatedAt: "2026-10-03T10:03:30.000Z" });
  const saved = newSavedRecord(unlinked.findings);
  const readinessCheck = buildRolloutReadiness(saved).checks.find((check) => check.id === `review-finding-remediation-verification-${findingId}`);
  assert.equal(readinessCheck.state, "blocked");
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: records });
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /numeric measurements whose source mappings are incomplete or inconsistent/i.test(risk)));
  const reviewed = reviewReleaseEvidenceBundle(bundle, { sourceName: "unlinked-numeric-sources.json" });
  assert.ok(reviewed.findings.some((finding) => finding.code.includes("measurement-source-summary") && finding.severity === "warning"));
});

test("verification source mappings persist into decision Markdown and release-bundle review checks them", () => {
  const imported = mergeReleaseBundleReviewFindings([], reviewFixture());
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, { status: "resolved", owner: "Platform", rationale: "Fix applied.", evidence: "CI 102" });
  const run = recordRemediationVerificationRun(resolved.findings, findingId, runInput({ measurementSources: loadTestSources() }), { updatedAt: "2026-10-03T10:04:00.000Z", loadTestRecords: records });
  const saved = newSavedRecord(run.findings);
  assert.equal(saved.reviewFindings[0].verificationRuns[0].measurementSources.p95LatencyMs.before.sourceRecordId, "lt-before");
  const md = formatArchitectureDecisionRecordMarkdown(saved);
  assert.match(md, /measurement source traceability complete/i);
  assert.match(md, /p95LatencyMs before: load-test-record; field observed\.p95LatencyMs; value 300/);
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: records, generatedAt: "2026-10-03T10:05:00.000Z" });
  const cleanReview = reviewReleaseEvidenceBundle(bundle, { sourceName: "traceable.json" });
  assert.equal(cleanReview.findings.some((finding) => /Measurement source traceability is/.test(finding.title)), false);

  const alteredBundle = structuredClone(bundle);
  alteredBundle.decisionRecord.reviewFindings[0].verificationRuns[0].measurements.p95LatencyMs.after = 170;
  const alteredReview = reviewReleaseEvidenceBundle(alteredBundle, { sourceName: "altered-source.json" });
  assert.ok(alteredReview.findings.some((finding) => finding.severity === "error" && /p95 latency after source mapping: mismatch/i.test(finding.title)));
});


test("source drift blocks reviewer confirmation and rollout readiness without replacing saved verification snapshots", () => {
  const imported = mergeReleaseBundleReviewFindings([], reviewFixture());
  const findingId = imported.findings[0].id;
  const resolved = updateTrackedReviewFinding(imported.findings, findingId, { status: "resolved", owner: "Platform", rationale: "Fix applied.", evidence: "CI 2026-10-02" });
  const run = recordRemediationVerificationRun(resolved.findings, findingId, runInput({ measurementSources: loadTestSources() }), {
    updatedAt: "2026-10-03T10:06:00.000Z", loadTestRecords: records,
  });
  const baselineSnapshot = structuredClone(run.run.measurementSources.p95LatencyMs.before.sourceSnapshot);
  const confirmed = confirmRemediationVerification(run.findings, findingId, run.run.id, {
    verifiedBy: "Reviewer", rationale: "The linked load test was rechecked.", updatedAt: "2026-10-03T10:06:30.000Z", loadTestRecords: records,
  });
  assert.equal(buildRemediationEffectivenessSummary(confirmed.finding, { loadTestRecords: records }).isVerified, true);
  const changedRecords = structuredClone(records);
  changedRecords[0].observed.p95LatencyMs = 275;
  assert.throws(() => confirmRemediationVerification(confirmed.findings, findingId, run.run.id, {
    verifiedBy: "Reviewer", rationale: "The linked load test was rechecked.", updatedAt: "2026-10-03T10:07:00.000Z", loadTestRecords: changedRecords,
  }), /source drift is drift-detected/i);
  const liveSummary = buildRemediationEffectivenessSummary(confirmed.finding, { loadTestRecords: changedRecords });
  assert.equal(liveSummary.isVerified, false);
  assert.equal(liveSummary.status, "measurement-source-drift-detected");
  const saved = newSavedRecord(confirmed.findings);
  const readiness = buildRolloutReadiness(saved, { loadTestRecords: changedRecords });
  assert.equal(readiness.checks.find((check) => check.id === `review-finding-remediation-verification-${findingId}`).state, "blocked");
  assert.deepEqual(saved.reviewFindings[0].verificationRuns[0].measurementSources.p95LatencyMs.before.sourceSnapshot, baselineSnapshot);
  assert.match(formatArchitectureDecisionRecordMarkdown(saved, { loadTestRecords: changedRecords }), /Current load-test source drift review/);

  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: changedRecords, generatedAt: "2026-10-03T10:08:00.000Z" });
  const review = reviewReleaseEvidenceBundle(bundle, { sourceName: "drifted-source.json" });
  assert.ok(review.findings.some((finding) => /source drift: Source value changed/i.test(finding.title)));
});

test("panel exposes per-side source mapping controls and traceability status", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /REMEDIATION_MEASUREMENT_SOURCE_OPTIONS/);
  assert.match(panel, /Source field path/);
  assert.match(panel, /Numeric value in source/);
  assert.match(panel, /Saved load-test record/);
  assert.match(panel, /Source traceability:/);
  assert.match(panel, /Measurement source traceability/);
  assert.match(panel, /Current source drift/);
  assert.match(panel, /original verification snapshot is retained/i);
});
