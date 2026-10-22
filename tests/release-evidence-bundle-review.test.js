import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { createArchitectureDecisionRecord } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { reviewReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundleReview.js";

const sampleReport = (overrides = {}) => ({
  title: "Architecture Decision Report",
  baselineName: "Baseline A",
  proposedName: "Proposed B",
  decision: "Promising simulation result — proceed to validation",
  rationale: "A like-for-like simulation showed lower p95 latency.",
  confidence: "Low — modeled evidence only",
  changeStatus: "changed",
  changeCount: 1,
  counts: { addedComponents: 1, removedComponents: 0, modifiedComponents: 0, addedRelationships: 0, removedRelationships: 0, modifiedRelationships: 0 },
  changes: [{ action: "Added", subjectType: "Component", label: "Cache", detail: "new component" }],
  simulationStatus: "comparable",
  simulationReason: "Matching profile and component scope.",
  metrics: [{ key: "p95LatencyMs", label: "p95 latency", before: 250, after: 170, delta: -80, direction: "improved" }],
  bottlenecks: [], traceEvidence: null, recommendations: [], portfolio: [],
  risks: ["Production behavior is not yet validated."],
  nextSteps: ["Review semantic changes."],
  limitations: ["Simulation results are synthetic."],
  profileConfirmed: true,
  loadTestRecordsCount: 1,
  ...overrides,
});

function makeBundle() {
  const record = createArchitectureDecisionRecord({
    report: sampleReport(),
    id: "adr-review-001",
    owner: "Platform team",
    status: "accepted",
    rationale: "Proceed to an independent rollout review after validation.",
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:30:00.000Z",
  });
  const loadTestRecords = [{
    id: "load-test-001", name: "Staging load", testedAt: "2026-10-18", targetEnvironment: "staging",
    source: "k6 summary JSON", workload: { durationSeconds: 300, offeredRps: 120, concurrency: 60 },
    observed: { throughputRps: 118, p95LatencyMs: 190, errorRatePercent: 0.4 }, notes: "Imported evidence",
  }];
  return buildReleaseEvidenceBundle({ record, loadTestRecords, generatedAt: "2026-10-19T11:00:00.000Z" });
}

const find = (review, code) => review.findings.find((finding) => finding.code === code);

test("reviews a valid bundle and keeps authenticity distinct from structure", () => {
  const bundle = makeBundle();
  const review = reviewReleaseEvidenceBundle(JSON.stringify(bundle), { sourceName: "candidate-release.json" });
  assert.notEqual(review.status, "invalid");
  assert.equal(review.sourceName, "candidate-release.json");
  assert.equal(review.bundleMetadata.recordId, "adr-review-001");
  assert.equal(review.counts.simulationMetrics, 1);
  assert.ok(find(review, "authenticity-unverified"));
  assert.match(review.interpretation, /does not verify signatures/i);
  assert.equal(review.status, "review-required", "the standard bundle has open readiness checks and needs human review");
  assert.equal(review.counts.openChecks > 0, true);
});

test("rejects malformed JSON, non-object roots, wrong type, and unsupported schema version", () => {
  assert.equal(reviewReleaseEvidenceBundle("{nope").status, "invalid");
  assert.ok(find(reviewReleaseEvidenceBundle("{nope"), "json-parse"));
  assert.ok(find(reviewReleaseEvidenceBundle("[]"), "root-type"));
  const wrongType = reviewReleaseEvidenceBundle({ ...makeBundle(), bundleType: "some.other.bundle" });
  assert.equal(wrongType.status, "invalid");
  assert.ok(find(wrongType, "bundle-type"));
  const wrongVersion = reviewReleaseEvidenceBundle({ ...makeBundle(), schemaVersion: 99 });
  assert.ok(find(wrongVersion, "schema-version"));
});

test("flags mismatched readiness counts and disposition", () => {
  const bundle = makeBundle();
  bundle.readiness.completeCount += 1;
  bundle.disposition = "ready-for-human-review";
  const review = reviewReleaseEvidenceBundle(bundle);
  assert.ok(find(review, "readiness-count-mismatch"));
  assert.ok(find(review, "disposition-mismatch"));
  assert.equal(review.status, "review-required");
});

test("detects metric delta tampering rather than silently accepting a conflicting comparison", () => {
  const bundle = makeBundle();
  bundle.evidenceInventory.simulationComparison.metrics[0].delta = 42;
  const review = reviewReleaseEvidenceBundle(bundle);
  assert.ok(find(review, "metric-delta-0"));
  assert.equal(find(review, "metric-delta-0").severity, "warning");
});

test("identifies load-test count drift, truncated evidence, and misreported verification", () => {
  const bundle = makeBundle();
  bundle.evidenceInventory.loadTests.recordCountAtExport = 31;
  bundle.evidenceInventory.loadTests.includedRecordCount = 1;
  bundle.evidenceInventory.loadTests.recordCountsMatch = false;
  bundle.evidenceInventory.loadTests.records[0].independentlyVerified = true;
  const review = reviewReleaseEvidenceBundle(bundle);
  assert.ok(find(review, "load-test-truncated"));
  assert.ok(find(review, "load-test-classification-0"));
  assert.equal(review.status, "review-required");
});

test("checks completed rollout evidence and preserves the human approval guardrail", () => {
  const bundle = makeBundle();
  bundle.evidenceInventory.rolloutChecks[0].state = "complete";
  bundle.evidenceInventory.rolloutChecks[0].checkedByRecordOwner = false;
  bundle.evidenceInventory.rolloutChecks[0].evidenceReference = "";
  bundle.riskAssessment.finalHumanApprovalRequired = false;
  const review = reviewReleaseEvidenceBundle(bundle);
  assert.ok(find(review, "rollout-check-evidence-0"));
  assert.ok(find(review, "human-approval-guardrail"));
  assert.equal(review.status, "invalid");
});

test("requires the decision snapshot and inventory sections", () => {
  const review = reviewReleaseEvidenceBundle({ bundleType: "sketchizi.workbench.release-evidence-bundle", schemaVersion: 1, decisionRecord: { id: "x" } });
  assert.equal(review.status, "invalid");
  assert.ok(find(review, "missing-readiness"));
  assert.ok(find(review, "missing-evidenceInventory"));
  assert.ok(find(review, "missing-report-snapshot"));
});

test("review identifies tracked open blockers in an exported decision record", () => {
  const bundle = makeBundle();
  bundle.decisionRecord.reviewFindings = [{
    id: "review-001", code: "bad-readiness-count", severity: "error", title: "Readiness counts disagree",
    detail: "The saved checklist and summary counts differ.", status: "open", owner: "", rationale: "", evidence: "",
    sourceBundleNames: ["previous.json"], createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T10:00:00.000Z",
    resolvedAt: null, auditTrail: [], evidenceClassification: "reviewer-tracked-finding", independentlyVerified: false,
  }];
  const review = reviewReleaseEvidenceBundle(bundle);
  assert.ok(find(review, "tracked-review-finding-open-0"));
  assert.equal(review.counts.trackedReviewFindings, 1);
  assert.equal(review.counts.openReviewFindings, 1);
  assert.equal(review.counts.blockingReviewFindings, 1);
  assert.equal(review.status, "review-required");
});

test("review UI is read-only and supports importing exported JSON", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Review exported release evidence bundle/);
  assert.match(panel, /type="file" accept="\.json,application\/json"/);
  assert.match(panel, /reviewReleaseEvidenceBundle\(source, \{ sourceName: file\.name \}\)/);
  assert.match(panel, /does not verify signatures, source authenticity, external references, or production safety/i);
  assert.match(panel, /Clear review/);
});
