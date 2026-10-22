import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeRemediationSourceDriftResolution } from "../src/features/simulation/experiments/remediationSourceDriftResolution.js";
import { buildRemediationEffectivenessSummary, confirmRemediationVerification, mergeReleaseBundleReviewFindings, recordRemediationSourceDriftResolution, recordRemediationVerificationRun, updateTrackedReviewFinding } from "../src/features/simulation/experiments/reviewFindingTracking.js";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecords, formatArchitectureDecisionRecordMarkdown } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";

const records = [
  { id: "before-1", name: "Initial before run", testedAt: "2026-10-01", targetEnvironment: "staging", source: "k6", schemaVersion: 1, workload: { offeredRps: 100, durationSeconds: 60, concurrency: 20 }, observed: { p95LatencyMs: 300, throughputRps: 80, errorRatePercent: 4 } },
  { id: "after-1", name: "Initial after run", testedAt: "2026-10-02", targetEnvironment: "staging", source: "k6", schemaVersion: 1, workload: { offeredRps: 100, durationSeconds: 60, concurrency: 20 }, observed: { p95LatencyMs: 180, throughputRps: 125, errorRatePercent: 0.5 } },
];
const findingReview = {
  sourceName: "resolution-fixture.json",
  bundleMetadata: { recordId: "adr-source-drift-resolution", generatedAt: "2026-10-03T10:00:00.000Z" },
  findings: [{ code: "p95-regression", severity: "error", title: "p95 latency regression", detail: "p95 exceeds the target in load test." }],
};
const measurementSources = {
  p95LatencyMs: {
    before: { sourceType: "load-test-record", sourceRecordId: "before-1" },
    after: { sourceType: "load-test-record", sourceRecordId: "after-1" },
  },
};
function initialFinding() {
  const merged = mergeReleaseBundleReviewFindings([], findingReview);
  const id = merged.findings[0].id;
  const resolved = updateTrackedReviewFinding(merged.findings, id, {
    status: "resolved", owner: "Platform", rationale: "Patch applied and deployed to staging.", evidence: "CI run 123",
  });
  const recorded = recordRemediationVerificationRun(resolved.findings, id, {
    runType: "load-test", outcome: "pass", beforeState: "p95 was above 200 ms.", afterState: "p95 is below 200 ms.",
    summary: "Compare before and after load tests.", evidence: "load-test run 123", recordedBy: "Engineer",
    measurements: { p95LatencyMs: { before: 300, after: 180 } }, measurementSources,
  }, { updatedAt: "2026-10-03T10:04:00.000Z", loadTestRecords: records });
  const confirmed = confirmRemediationVerification(recorded.findings, id, recorded.run.id, {
    verifiedBy: "Original reviewer", rationale: "Initial baseline source snapshots match their attached load-test records.",
    updatedAt: "2026-10-03T10:04:30.000Z", loadTestRecords: records,
  });
  return { findings: confirmed.findings, id, run: confirmed.run };
}
function savedRecord(findings) {
  const record = createArchitectureDecisionRecord({
    id: "adr-source-drift-resolution", owner: "Platform", rationale: "Review evidence drift.",
    report: { title: "Architecture review", risks: [], limitations: [], simulationStatus: "comparable", metrics: [], loadTestRecordsCount: 2 },
  });
  return updateArchitectureDecisionRecords([record], record.id, { reviewFindings: findings })[0];
}

test("drift resolution shows original/current snapshots side-by-side and only permits display-name-only acceptance", () => {
  const base = initialFinding();
  const renamed = structuredClone(records);
  renamed[0].name = "Renamed without measurement change";
  const summary = summarizeRemediationSourceDriftResolution(base.findings[0], base.run.id, renamed);
  assert.equal(summary.status, "needs-review");
  const before = summary.items.find((item) => item.side === "before");
  assert.equal(before.canAcceptAsContext, true);
  assert.equal(before.originalSnapshot.recordMetadata.name, "Initial before run");
  assert.equal(before.currentSnapshot.recordMetadata.name, "Renamed without measurement change");
  assert.equal(before.originalSnapshot.sourceValue, 300);
  assert.equal(before.currentSnapshot.sourceValue, 300);

  const changedValue = structuredClone(renamed);
  changedValue[0].observed.p95LatencyMs = 270;
  const valueSummary = summarizeRemediationSourceDriftResolution(base.findings[0], base.run.id, changedValue);
  const valueItem = valueSummary.items.find((item) => item.side === "before");
  assert.equal(valueItem.canAcceptAsContext, false);
  assert.throws(() => recordRemediationSourceDriftResolution(base.findings, base.id, base.run.id, valueItem.metricKey, valueItem.side, {
    disposition: "acceptable-context", reviewer: "Reviewer", rationale: "Value changed but accepted.",
  }, { updatedAt: "2026-10-03T10:06:00.000Z", loadTestRecords: changedValue }), /display-name-only change/i);
});

test("reviewed display-name-only drift can remain accepted without mutating historical snapshots", () => {
  const base = initialFinding();
  const originalSnapshot = structuredClone(base.run.measurementSources.p95LatencyMs.before.sourceSnapshot);
  const renamed = structuredClone(records);
  renamed[0].name = "Current catalogue label";
  const summary = summarizeRemediationSourceDriftResolution(base.findings[0], base.run.id, renamed);
  const item = summary.items.find((entry) => entry.side === "before");
  const reviewed = recordRemediationSourceDriftResolution(base.findings, base.id, base.run.id, item.metricKey, item.side, {
    disposition: "acceptable-context", reviewer: "Reviewer A", rationale: "Only the label changed; source value, field, schema and workload are the same.",
  }, { updatedAt: "2026-10-03T10:05:00.000Z", loadTestRecords: renamed });
  const confirmed = confirmRemediationVerification(reviewed.findings, base.id, base.run.id, {
    verifiedBy: "Reviewer A", rationale: "Verified run; name-only source label change reviewed as non-material.",
    updatedAt: "2026-10-03T10:06:00.000Z", loadTestRecords: renamed,
  });
  const effectiveness = buildRemediationEffectivenessSummary(confirmed.finding, { loadTestRecords: renamed });
  assert.equal(effectiveness.isVerified, true);
  assert.equal(effectiveness.sourceDriftResolutionSummary.status, "accepted-context");
  assert.deepEqual(confirmed.finding.verificationRuns[0].measurementSources.p95LatencyMs.before.sourceSnapshot, originalSnapshot);
  assert.equal(confirmed.finding.sourceDriftReviews[0].originalSnapshot.recordMetadata.name, "Initial before run");
  assert.equal(confirmed.finding.sourceDriftReviews[0].currentSnapshot.recordMetadata.name, "Current catalogue label");
  const saved = savedRecord(confirmed.findings);
  const markdown = formatArchitectureDecisionRecordMarkdown(saved, { loadTestRecords: renamed });
  assert.match(markdown, /Source drift resolution history/);
  assert.match(markdown, /Current catalogue label/);
  const bundle = buildReleaseEvidenceBundle({ record: saved, loadTestRecords: renamed, generatedAt: "2026-10-03T10:06:30.000Z" });
  assert.equal(bundle.decisionRecord.reviewFindings[0].sourceDriftReviews.length, 1);
  const bundleReview = reviewReleaseEvidenceBundle(bundle, { sourceName: "accepted-name-change.json" });
  assert.ok(bundleReview.findings.some((entry) => /reviewed as non-material context/i.test(entry.title)));
  assert.equal(bundleReview.findings.some((entry) => /source drift: Source metadata changed/i.test(entry.title)), false);
});

test("value drift review preserves the old run, requires re-verification, and a changed source fingerprint needs a new review", () => {
  const base = initialFinding();
  const changed = structuredClone(records);
  changed[0].observed.p95LatencyMs = 275;
  let summary = summarizeRemediationSourceDriftResolution(base.findings[0], base.run.id, changed);
  const item = summary.items.find((entry) => entry.side === "before");
  const reviewed = recordRemediationSourceDriftResolution(base.findings, base.id, base.run.id, item.metricKey, item.side, {
    disposition: "requires-reverification", reviewer: "Reviewer B", rationale: "Source value changed; rerun using current records.",
  }, { updatedAt: "2026-10-03T10:07:00.000Z", loadTestRecords: changed });
  assert.equal(reviewed.finding.remediationVerification.status, "superseded");
  assert.ok(reviewed.finding.verificationRuns[0].verificationSupersededAt);
  assert.throws(() => confirmRemediationVerification(reviewed.findings, base.id, base.run.id, {
    verifiedBy: "Reviewer B", rationale: "Try old run.", updatedAt: "2026-10-03T10:08:00.000Z", loadTestRecords: changed,
  }), /superseded/i);
  assert.equal(reviewed.finding.verificationRuns[0].measurementSources.p95LatencyMs.before.sourceSnapshot.sourceValue, 300);
  assert.equal(buildRemediationEffectivenessSummary(reviewed.finding, { loadTestRecords: changed }).isVerified, false);

  const changedAgain = structuredClone(changed);
  changedAgain[0].observed.p95LatencyMs = 270;
  summary = summarizeRemediationSourceDriftResolution(reviewed.finding, base.run.id, changedAgain);
  assert.equal(summary.items.find((entry) => entry.side === "before").reviewState, "needs-review");
  assert.equal(summary.status, "needs-review");

  const bundle = buildReleaseEvidenceBundle({ record: savedRecord(reviewed.findings), loadTestRecords: changedAgain, generatedAt: "2026-10-03T10:09:00.000Z" });
  const bundleReview = reviewReleaseEvidenceBundle(bundle, { sourceName: "drift-reviewed.json" });
  assert.ok(bundleReview.findings.some((entry) => /source drift/i.test(entry.title)));
  assert.ok(bundleReview.findings.some((entry) => /source drift review no longer matches current evidence/i.test(entry.title)));
});

test("panel surfaces source comparisons, reviewer rationale, and new-run guidance", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Original snapshot/);
  assert.match(panel, /Current source/);
  assert.match(panel, /Save drift review/);
  assert.match(panel, /requires a new verification run/i);
  assert.match(panel, /historical and unchanged/);
});
