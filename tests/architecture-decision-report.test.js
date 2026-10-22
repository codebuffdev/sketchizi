import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArchitectureDecisionReport, formatArchitectureDecisionReportMarkdown } from "../src/features/simulation/experiments/architectureDecisionReport.js";

const metric = (key, direction, before = 100, after = 90) => ({ key, label: key, before, after, delta: after - before, deltaPercent: -10, direction });
const impact = (status, simulationStatus = "comparable", metrics = []) => ({
  status,
  reason: "One semantic change detected.",
  changeCount: 1,
  entityChanges: { added: [], removed: [], modified: [{ id: "api", fields: ["properties.concurrency"] }] },
  relationChanges: { added: [], removed: [], modified: [] },
  changes: [{ id: "entity-modified:api", subjectType: "Component", action: "Modified", label: "API", detail: "Changed: properties.concurrency", fields: ["properties.concurrency"], entityIds: ["api"] }],
  simulation: { status: simulationStatus, reason: simulationStatus === "comparable" ? "Matched synthetic runs." : "Profile fingerprints do not match.", metrics },
});

test("reports promising simulation result without calling it production proof", () => {
  const report = buildArchitectureDecisionReport({
    baselineName: "Original", architectureImpact: impact("changed", "comparable", [metric("throughputRps", "improved", 90, 110), metric("p95LatencyMs", "improved", 230, 180)]),
    profileConfirmed: true,
  });
  assert.match(report.decision, /Promising simulation result/);
  assert.match(report.confidence, /Low/);
  assert.ok(report.limitations.some((item) => /synthetic/i.test(item)));
  assert.match(formatArchitectureDecisionReportMarkdown(report), /## Simulation comparison/);
});

test("Markdown formats success-rate deltas as percentage points, not raw fractions", () => {
  const report = buildArchitectureDecisionReport({
    architectureImpact: impact("changed", "comparable", [
      { key: "successRate", label: "Success rate", before: 0.95, after: 0.98, delta: 0.03, deltaPercent: 3.16, direction: "improved" },
    ]),
  });
  const markdown = formatArchitectureDecisionReportMarkdown(report);
  assert.match(markdown, /95\.00%/);
  assert.match(markdown, /98\.00%/);
  assert.match(markdown, /3\.00 percentage points/);
});

test("mixed favorable and regressed metrics require trade-off review", () => {
  const report = buildArchitectureDecisionReport({ architectureImpact: impact("changed", "comparable", [metric("throughputRps", "improved"), metric("p95LatencyMs", "regressed")]) });
  assert.match(report.decision, /Mixed simulation result/);
  assert.ok(report.risks.some((risk) => /regressed/i.test(risk)));
});

test("unmatched simulation does not infer whether architecture change helped", () => {
  const report = buildArchitectureDecisionReport({ architectureImpact: impact("changed", "context-mismatch") });
  assert.match(report.decision, /Insufficient comparable simulation evidence/);
  assert.ok(report.nextSteps.some((step) => /matching profile assumptions and component scope/i.test(step)));
  assert.equal(report.metrics.length, 0);
});

test("identical architectures and unavailable baselines receive explicit decision states", () => {
  const identical = buildArchitectureDecisionReport({ architectureImpact: { status: "identical", changeCount: 0, entityChanges: {}, relationChanges: {}, changes: [], simulation: { status: "unavailable", reason: "No change" } } });
  const unavailable = buildArchitectureDecisionReport({ architectureImpact: null });
  assert.match(identical.decision, /No semantic change/);
  assert.match(unavailable.decision, /Baseline unavailable/);
});

test("includes bottleneck evidence, trace, recommendations, and ranked portfolio trials", () => {
  const report = buildArchitectureDecisionReport({
    architectureImpact: impact("changed", "comparable", [metric("throughputRps", "improved")]),
    bottlenecks: [{ entityId: "api", label: "API", hasPressure: true, peakUtilization: 0.91, queueWaitP95Ms: 23, maxDropped: 3, maxFailed: 1 }],
    traceEvidence: { entityId: "api", componentLabel: "API", requestOutcome: "success", operation: "read", durationMs: 18, serviceTimeMs: 14, queueWaitMs: 4, scenarioLabel: "Traffic surge" },
    optimizationRecommendations: [{ interventionKind: "capacity", label: "Test capacity", reason: "Drops recorded", entityId: "api" }],
    optimizationTrials: [{ id: "trial-1", label: "Capacity +20%", interventionKind: "capacity", comparisonScenarioLabel: "Traffic surge", comparison: { status: "ready", metrics: [metric("throughputRps", "improved", 100, 115)] } }],
  });
  assert.equal(report.bottlenecks[0].label, "API");
  assert.equal(report.traceEvidence.operation, "read");
  assert.equal(report.recommendations[0].interventionKind, "capacity");
  assert.equal(report.portfolio.length, 1);
  const markdown = formatArchitectureDecisionReportMarkdown(report);
  assert.match(markdown, /Bottleneck evidence/);
  assert.match(markdown, /Optimization portfolio/);
  assert.match(markdown, /production measurements/);
});

test("flags load-test records as unlinked evidence and unconfirmed profile assumptions", () => {
  const report = buildArchitectureDecisionReport({ architectureImpact: impact("changed", "unavailable"), loadTestRecordsCount: 2, profileConfirmed: false });
  assert.ok(report.risks.some((risk) => /2 load-test record\(s\) exist.*does not automatically establish/i.test(risk)));
  assert.ok(report.risks.some((risk) => /not confirmed/i.test(risk)));
});

test("panel exposes the decision report and Markdown export control", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /buildArchitectureDecisionReport/);
  assert.match(panel, /Architecture decision report/);
  assert.match(panel, /Export decision report \(\.md\)/);
  assert.match(panel, /activeInvestigation/);
  assert.match(panel, /optimizationPortfolioTrials/);
});
