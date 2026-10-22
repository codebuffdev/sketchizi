import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createArchitectureDecisionRecord, updateArchitectureDecisionRecord } from "../src/features/simulation/experiments/architectureDecisionRecord.js";
import { createDefaultRolloutChecks } from "../src/features/simulation/experiments/rolloutReadiness.js";
import { buildReleaseEvidenceBundle } from "../src/features/simulation/experiments/releaseEvidenceBundle.js";
import { mergeReleaseBundleReviewFindings, updateTrackedReviewFinding } from "../src/features/simulation/experiments/reviewFindingTracking.js";

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
  nextSteps: ["Review semantic changes.", "Run a production-like load test."],
  limitations: ["Simulation results are synthetic."],
  profileConfirmed: true,
  loadTestRecordsCount: 1,
  ...overrides,
});

function createRecord(overrides = {}) {
  return createArchitectureDecisionRecord({
    report: sampleReport(),
    id: "adr-release-001",
    owner: "Platform team",
    status: "accepted",
    rationale: "Proceed to independent rollout review after closing evidence gaps.",
    createdAt: "2026-10-19T10:00:00.000Z",
    ...overrides,
  });
}

const sampleLoadTest = (overrides = {}) => ({
  schemaVersion: 1,
  id: "load-test-001",
  name: "Staging sustained load",
  testedAt: "2026-10-18",
  targetEnvironment: "staging-eu-1",
  source: "k6 summary JSON",
  workload: { durationSeconds: 300, offeredRps: 120, concurrency: 60 },
  observed: { throughputRps: 118, p95LatencyMs: 190, errorRatePercent: 0.4, secretLikeExtra: "must not pass through" },
  notes: "Imported by platform team.",
  credentials: "must not pass through",
  ...overrides,
});

test("builds a self-contained release evidence bundle with explicit evidence classifications", () => {
  const bundle = buildReleaseEvidenceBundle({ record: createRecord(), loadTestRecords: [sampleLoadTest()], generatedAt: "2026-10-19T12:00:00.000Z" });
  assert.equal(bundle.bundleType, "sketchizi.workbench.release-evidence-bundle");
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.generatedAt, "2026-10-19T12:00:00.000Z");
  assert.equal(bundle.decisionRecord.id, "adr-release-001");
  assert.equal(bundle.evidenceInventory.simulationComparison.evidenceClassification, "modeled-simulation-output");
  assert.equal(bundle.evidenceInventory.simulationComparison.metrics[0].delta, -80);
  assert.equal(bundle.evidenceInventory.loadTests.records[0].evidenceClassification, "user-supplied-measurement");
  assert.equal(bundle.evidenceInventory.loadTests.records[0].independentlyVerified, false);
  assert.equal(bundle.evidenceInventory.loadTests.records[0].credentials, undefined);
  assert.equal(bundle.evidenceInventory.loadTests.records[0].observed.secretLikeExtra, undefined);
  assert.equal(bundle.interpretationRules.manualAttestation.includes("not independently verified"), true);
  assert.equal(bundle.riskAssessment.finalHumanApprovalRequired, true);
});

test("separates rollout manual attestations and machine-derived readiness assessments", () => {
  const record = createRecord();
  const checks = createDefaultRolloutChecks().map((check) => ({ ...check, done: true, evidence: `Runbook or ticket for ${check.id}`, completedAt: "2026-10-19T11:00:00.000Z" }));
  const complete = updateArchitectureDecisionRecord(record, { rolloutChecks: checks, validationGates: [{ id: "gate-1", label: "Independent architecture review", done: true }] }, { updatedAt: "2026-10-19T11:30:00.000Z" });
  const bundle = buildReleaseEvidenceBundle({ record: complete, loadTestRecords: [sampleLoadTest()] });
  const manual = bundle.evidenceInventory.rolloutChecks[0];
  assert.equal(manual.evidenceClassification, "manual-attestation");
  assert.equal(manual.evidenceReferenceVerified, false);
  const system = bundle.readiness.checks.find((check) => check.id === "simulation-evidence");
  assert.equal(system.evidenceClassification, "machine-derived-assessment");
  assert.equal(system.state, "complete");
  assert.equal(bundle.evidenceInventory.decisionValidationGates[0].evidenceClassification, "manual-attestation");
  assert.equal(bundle.disposition, "ready-for-human-review");
  assert.equal(bundle.riskAssessment.finalHumanApprovalRequired, true);
});

test("marks mismatched load-test counts and outstanding gates/checks as unresolved risks", () => {
  const record = createRecord({ report: sampleReport({ loadTestRecordsCount: 3 }), validationGates: [{ id: "gate-1", label: "Security review", done: false }] });
  const bundle = buildReleaseEvidenceBundle({ record, loadTestRecords: [sampleLoadTest()] });
  assert.equal(bundle.evidenceInventory.loadTests.recordCountsMatch, false);
  assert.equal(bundle.evidenceInventory.loadTests.reportSnapshotRecordCount, 3);
  assert.equal(bundle.evidenceInventory.loadTests.recordCountAtExport, 1);
  assert.equal(bundle.riskAssessment.outstandingDecisionGates.length, 1);
  assert.ok(bundle.riskAssessment.additionalRisks.some((risk) => /counted 3 load-test records/i.test(risk)));
  assert.ok(bundle.riskAssessment.outstandingReadinessChecks.length > 0);
  assert.notEqual(bundle.disposition, "ready-for-human-review");
});

test("requires a saved decision record and bounds included records", () => {
  assert.throws(() => buildReleaseEvidenceBundle(), /saved architecture decision record/i);
  const records = Array.from({ length: 30 }, (_, index) => sampleLoadTest({ id: `load-${index}`, name: `Load test ${index}` }));
  const bundle = buildReleaseEvidenceBundle({ record: createRecord(), loadTestRecords: records });
  assert.equal(bundle.evidenceInventory.loadTests.records.length, 25);
  assert.equal(bundle.evidenceInventory.loadTests.recordCountAtExport, 30);
  assert.equal(bundle.evidenceInventory.loadTests.includedRecordCount, 25);
});

test("release bundle preserves tracked finding dispositions and labels them as manual records", () => {
  const imported = mergeReleaseBundleReviewFindings([], {
    sourceName: "candidate.json",
    findings: [{ code: "readiness-count-mismatch", severity: "error", title: "Readiness count mismatch", detail: "Counts do not agree." }],
  });
  const tracked = updateTrackedReviewFinding(imported.findings, imported.findings[0].id, {
    owner: "Platform team", status: "accepted-risk", rationale: "Known export issue has a bounded operational impact.", evidence: "Risk ticket REL-18",
  });
  const record = updateArchitectureDecisionRecord(createRecord(), { reviewFindings: tracked.findings });
  const bundle = buildReleaseEvidenceBundle({ record, loadTestRecords: [sampleLoadTest()] });
  const finding = bundle.decisionRecord.reviewFindings[0];
  assert.equal(finding.status, "accepted-risk");
  assert.equal(finding.owner, "Platform team");
  assert.equal(finding.evidenceClassification, "manual-risk-acceptance");
  assert.equal(finding.independentlyVerified, false);
  assert.ok(finding.auditTrail.some((event) => event.type === "status-changed"));
  assert.ok(bundle.riskAssessment.outstandingReadinessChecks.some((check) => /review finding/i.test(check.label)) === false,
    "a fully documented accepted risk does not stay open as a blocking finding");
});

test("bundle export is exposed from the decision record UI and documents its evidence limits", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Export release evidence bundle \(\.json\)/);
  assert.match(panel, /downloadReleaseEvidenceBundle\(selectedDecisionRecord, loadTestRecords\)/);
  assert.match(panel, /external references are not independently verified/i);
});
