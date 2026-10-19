/**
 * Build a portable, bounded JSON evidence report for a completed Workbench
 * experiment. Engine internals and per-request traces are intentionally omitted;
 * provenance, assumptions, aggregate metrics, scenario rankings and diagnostics
 * are retained so the report can be reviewed outside the live UI.
 */
export const SIMULATION_EVIDENCE_REPORT_SCHEMA_VERSION = 1;

const metricSummary = (metrics) => metrics ? {
  offeredRequests: metrics.offeredRequests ?? null,
  successfulRequests: metrics.successfulRequests ?? null,
  failedRequests: metrics.failedRequests ?? null,
  droppedRequests: metrics.droppedRequests ?? null,
  throughputRps: metrics.throughputRps ?? null,
  p95LatencyMs: metrics.successfulLatencyMs?.p95 ?? null,
} : null;

function scenarioSummary(scenario) {
  return {
    id: scenario.id ?? null,
    name: scenario.name ?? scenario.label ?? null,
    kind: scenario.kind ?? null,
    status: scenario.status ?? null,
    metrics: metricSummary(scenario.metrics),
    p95LatencyMs: scenario.p95LatencyMs ?? null,
    failedRatePercent: scenario.failedRatePercent ?? null,
    throughputLossPercent: scenario.throughputLossPercent ?? null,
    strongestIndividualLossPercent: scenario.strongestIndividualLossPercent ?? null,
    additionalLossPercent: scenario.additionalLossPercent ?? null,
    interaction: scenario.interaction ?? null,
    sloStatus: scenario.sloStatus ?? null,
    multiplier: scenario.multiplier ?? null,
    targets: Array.isArray(scenario.targets) ? scenario.targets.map(({ id, name, kind }) => ({ id, name, kind })) : undefined,
  };
}

export function createSimulationEvidenceReport({ experimentType, results } = {}) {
  if (typeof experimentType !== "string" || !experimentType.trim()) throw new TypeError("experimentType is required.");
  if (!results || typeof results !== "object") throw new TypeError("Experiment results are required.");
  const report = {
    reportType: "sketchizi-workbench-simulation-evidence",
    schemaVersion: SIMULATION_EVIDENCE_REPORT_SCHEMA_VERSION,
    experimentType,
    status: results.status ?? "unknown",
    provenance: results.provenance ?? null,
    assumptions: {
      interpretation: results.interpretation ?? null,
      trafficMultiplier: results.trafficMultiplier ?? null,
      targets: results.targets ?? null,
      truncated: results.truncated ?? null,
      totalPairCount: results.totalPairCount ?? null,
      evaluatedPairCount: results.evaluatedPairCount ?? null,
    },
    baseline: results.baseline ? {
      status: results.baseline.status ?? null,
      metrics: metricSummary(results.baseline.metrics),
      failedRatePercent: results.baseline.failedRatePercent ?? null,
      p95LatencyMs: results.baseline.p95LatencyMs ?? null,
    } : null,
    scenarios: Array.isArray(results.scenarios) ? results.scenarios.map(scenarioSummary) : undefined,
    points: Array.isArray(results.points) ? results.points.map(scenarioSummary) : undefined,
    individualScenarios: Array.isArray(results.individualScenarios) ? results.individualScenarios.map(scenarioSummary) : undefined,
    diagnostics: Array.isArray(results.diagnostics) ? results.diagnostics.map(({ code, severity, title, message, entityIds, relationIds }) => ({ code, severity, title, message, entityIds, relationIds })) : [],
    sourceModelSnapshot: results.sourceModelSnapshot ?? null,
    profileUsed: results.profileUsed ?? null,
    limitations: [
      "Results are synthetic model outputs, not live telemetry or a production guarantee.",
      "The report does not assert unmodeled recovery, failover, retries, or real-world cascading behavior.",
      "Null metrics mean the simulator did not provide a comparable value; they are not zero.",
    ],
  };
  const safeType = experimentType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment";
  return {
    filename: `sketchizi-${safeType}-evidence.json`,
    mimeType: "application/json;charset=utf-8",
    text: `${JSON.stringify(report, null, 2)}\n`,
    value: report,
  };
}
