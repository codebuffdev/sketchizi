import { buildOptimizationPortfolio } from "./optimizationPortfolio.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const display = (value) => value == null || value === "" ? "Unavailable" : String(value);
const formatNumber = (value, digits = 2) => finite(value) ? Number(value.toFixed(digits)).toString() : "Unavailable";
function formatMetricValue(key, value) {
  if (!finite(value)) return "Unavailable";
  if (key === "successRate") return `${(value * 100).toFixed(2)}%`;
  if (key === "throughputRps") return `${formatNumber(value)} req/s`;
  if (key === "p95LatencyMs") return `${formatNumber(value)} ms`;
  if (["droppedRequests", "failedRequests", "offeredRequests", "successfulRequests"].includes(key)) return Math.round(value).toLocaleString();
  return formatNumber(value);
}
function formatMetricDelta(metric) {
  if (!finite(metric?.delta)) return "Unavailable";
  const prefix = metric.delta > 0 ? "+" : "";
  if (metric.key === "successRate") return `${prefix}${(metric.delta * 100).toFixed(2)} percentage points`;
  if (metric.key === "throughputRps") return `${prefix}${formatNumber(metric.delta)} req/s`;
  if (metric.key === "p95LatencyMs") return `${prefix}${formatNumber(metric.delta)} ms`;
  if (["droppedRequests", "failedRequests", "offeredRequests", "successfulRequests"].includes(metric.key)) return `${prefix}${Math.round(metric.delta)}`;
  return `${prefix}${formatNumber(metric.delta)}`;
}

function impactCounts(impact) {
  const entities = impact?.entityChanges || {};
  const relations = impact?.relationChanges || {};
  return {
    addedComponents: safeArray(entities.added).length,
    removedComponents: safeArray(entities.removed).length,
    modifiedComponents: safeArray(entities.modified).length,
    addedRelationships: safeArray(relations.added).length,
    removedRelationships: safeArray(relations.removed).length,
    modifiedRelationships: safeArray(relations.modified).length,
  };
}

function decide(impact) {
  if (!impact || impact.status === "unavailable") {
    return { decision: "Baseline unavailable", rationale: impact?.reason || "A saved semantic architecture baseline is required before an architecture decision can be assessed." };
  }
  if (impact.status === "identical") {
    return { decision: "No semantic change detected", rationale: "The current architecture has no semantic differences from the selected saved baseline. There is no architecture delta to approve in this comparison." };
  }
  if (impact.simulation?.status !== "comparable") {
    return { decision: "Insufficient comparable simulation evidence", rationale: `The architecture differs from the baseline, but metric deltas are withheld: ${impact.simulation?.reason || "comparable simulation outcomes are unavailable"}` };
  }
  const metrics = safeArray(impact.simulation.metrics);
  const improvements = metrics.filter((metric) => metric.direction === "improved").length;
  const regressions = metrics.filter((metric) => metric.direction === "regressed").length;
  if (regressions > 0 && improvements > 0) {
    return { decision: "Mixed simulation result — resolve trade-offs before adoption", rationale: `${improvements} metric(s) moved in the favorable direction and ${regressions} regressed. The preferred outcome depends on explicit service objectives and risk tolerance.` };
  }
  if (regressions > 0) {
    return { decision: "Hold and investigate simulation regressions", rationale: `${regressions} comparable metric(s) regressed. Do not adopt the proposed change based on this run without explaining and retesting those regressions.` };
  }
  if (improvements > 0) {
    return { decision: "Promising simulation result — proceed to validation", rationale: `${improvements} metric(s) moved in the favorable direction and none of the available metrics regressed. This is synthetic what-if evidence, not proof of production improvement.` };
  }
  return { decision: "No directional improvement demonstrated", rationale: "The comparable simulation metrics do not demonstrate a directional improvement. Revisit the hypothesis or define a more discriminating experiment." };
}

/**
 * Synthesize an architecture decision brief from existing Workbench evidence.
 * This intentionally distinguishes modeled evidence from production validation.
 */
export function buildArchitectureDecisionReport({
  baselineName = "Saved experiment baseline",
  proposedName = "Current architecture",
  architectureImpact = null,
  bottlenecks = [],
  traceEvidence = null,
  optimizationRecommendations = [],
  optimizationTrials = [],
  loadTestRecordsCount = 0,
  profileConfirmed = false,
  selectedScenarioLabel = null,
} = {}) {
  const counts = impactCounts(architectureImpact);
  const outcome = decide(architectureImpact);
  const metrics = safeArray(architectureImpact?.simulation?.metrics).map((metric) => ({
    key: metric.key,
    label: metric.label || metric.key,
    before: finite(metric.before) ? metric.before : null,
    after: finite(metric.after) ? metric.after : null,
    delta: finite(metric.delta) ? metric.delta : null,
    deltaPercent: finite(metric.deltaPercent) ? metric.deltaPercent : null,
    direction: metric.direction || "unavailable",
  }));
  const strongestBottlenecks = safeArray(bottlenecks)
    .filter((item) => item && (item.hasPressure || (item.maxDropped || 0) > 0 || (item.maxFailed || 0) > 0 || (item.queueWaitP95Ms || 0) > 0))
    .slice(0, 4)
    .map((item) => ({
      entityId: item.entityId || null,
      label: item.label || item.entityId || "Component",
      peakUtilization: finite(item.peakUtilization) ? item.peakUtilization : null,
      queueWaitP95Ms: finite(item.queueWaitP95Ms) ? item.queueWaitP95Ms : null,
      maxDropped: finite(item.maxDropped) ? item.maxDropped : 0,
      maxFailed: finite(item.maxFailed) ? item.maxFailed : 0,
      writeContentionMsTotal: finite(item.writeContentionMsTotal) ? item.writeContentionMsTotal : null,
    }));
  const recommendations = safeArray(optimizationRecommendations).slice(0, 4).map((item) => ({
    label: item.label || item.interventionKind || "Optimization experiment",
    interventionKind: item.interventionKind || "unknown",
    reason: item.reason || "Evidence-backed experiment candidate; review its explicit assumptions before running.",
    entityId: item.entityId || null,
  }));
  const portfolio = buildOptimizationPortfolio(optimizationTrials).slice(0, 5).map((trial) => ({
    rank: trial.rank,
    label: trial.label,
    interventionKind: trial.interventionKind,
    score: trial.score,
    outcome: trial.outcome,
    metrics: trial.metrics,
    limitations: trial.limitations,
  }));
  const changeList = safeArray(architectureImpact?.changes).slice(0, 30).map((change) => ({
    action: change.action || "Changed",
    subjectType: change.subjectType || "Element",
    label: change.label || change.subjectId || change.id || "Unnamed element",
    detail: change.detail || "",
    fields: safeArray(change.fields),
    entityIds: safeArray(change.entityIds),
  }));
  const risks = [];
  if (counts.removedComponents > 0) risks.push(`${counts.removedComponents} component(s) are removed; check callers, data ownership, operational dependencies and migration/rollback paths.`);
  if (counts.removedRelationships > 0 || counts.modifiedRelationships > 0) risks.push("Typed request or data-flow relationships changed; verify the intended paths and any downstream assumptions.");
  if (architectureImpact?.status === "changed" && architectureImpact?.simulation?.status !== "comparable") risks.push("Architecture change and simulation outcomes are not currently comparable; do not infer performance impact from unrelated runs.");
  if (metrics.some((metric) => metric.direction === "regressed")) risks.push("At least one available simulation metric regressed; document whether that trade-off is acceptable before adoption.");
  if (!profileConfirmed) risks.push("The run's infrastructure assumptions are not confirmed as a complete set; review the profile before relying on the outcome.");
  if (loadTestRecordsCount <= 0) risks.push("No imported load-test records are attached to this report. Production behavior has not been validated here.");
  else risks.push(`${loadTestRecordsCount} load-test record(s) exist in the profile, but this report does not automatically establish that they match the proposed architecture, workload or scope.`);
  if (!strongestBottlenecks.length) risks.push("No pressure signal was provided to the report; absence of a listed bottleneck is not proof of adequate capacity.");
  const nextSteps = [];
  if (architectureImpact?.status === "unavailable") nextSteps.push("Select a saved experiment with a semantic model snapshot as the baseline.");
  else if (architectureImpact?.status === "changed" && architectureImpact?.simulation?.status !== "comparable") nextSteps.push("Run the current model with matching profile assumptions and component scope, then rerun the baseline if its provenance is incomplete.");
  else if (architectureImpact?.status === "changed") nextSteps.push("Review each semantic change and its affected components before accepting the simulated outcome.");
  if (recommendations.length) nextSteps.push("Run one evidence-guided optimization experiment at a time and add the completed result to the comparison portfolio.");
  else nextSteps.push("If a performance decision is required, create a targeted workload and collect component-level evidence before selecting an intervention.");
  nextSteps.push("Validate the chosen design with a repeatable production-like load test, defined service objectives, and a rollback plan.");
  nextSteps.push("Have the design and trade-offs reviewed by the responsible engineering owner before rollout.");

  return {
    title: "Architecture Decision Report",
    baselineName,
    proposedName,
    decision: outcome.decision,
    rationale: outcome.rationale,
    confidence: "Low — modeled evidence only",
    changeStatus: architectureImpact?.status || "unavailable",
    changeCount: finite(architectureImpact?.changeCount) ? architectureImpact.changeCount : 0,
    counts,
    changes: changeList,
    simulationStatus: architectureImpact?.simulation?.status || "unavailable",
    simulationReason: architectureImpact?.simulation?.reason || "Simulation comparison is unavailable.",
    metrics,
    selectedScenarioLabel: selectedScenarioLabel || null,
    bottlenecks: strongestBottlenecks,
    traceEvidence: traceEvidence ? {
      label: traceEvidence.label || traceEvidence.entityId || "Selected request trace",
      requestOutcome: traceEvidence.requestOutcome || "unknown",
      operation: traceEvidence.operation || null,
      durationMs: finite(traceEvidence.durationMs) ? traceEvidence.durationMs : null,
      serviceTimeMs: finite(traceEvidence.serviceTimeMs) ? traceEvidence.serviceTimeMs : null,
      queueWaitMs: finite(traceEvidence.queueWaitMs) ? traceEvidence.queueWaitMs : null,
      scenarioLabel: traceEvidence.scenarioLabel || null,
    } : null,
    recommendations,
    portfolio,
    loadTestRecordsCount: finite(loadTestRecordsCount) ? Math.max(0, Math.floor(loadTestRecordsCount)) : 0,
    profileConfirmed: Boolean(profileConfirmed),
    risks,
    nextSteps,
    limitations: [
      "Simulation results are synthetic, assumption-driven what-if outputs, not production measurements or performance guarantees.",
      "The report does not infer causality from architecture differences; profile, workload, scope and result provenance must be reviewed.",
      "Load-test records counted here are not automatically matched to this exact proposed architecture.",
      "Recommendations are experiment candidates, not automatic code, schema, infrastructure or architecture changes.",
    ],
  };
}

/** Render a portable Markdown report without depending on browser APIs. */
export function formatArchitectureDecisionReportMarkdown(report = {}) {
  const lines = [
    `# ${display(report.title || "Architecture Decision Report")}`,
    "",
    `- **Baseline:** ${display(report.baselineName)}`,
    `- **Proposed architecture:** ${display(report.proposedName)}`,
    `- **Decision status:** ${display(report.decision)}`,
    `- **Confidence:** ${display(report.confidence)}`,
    `- **Semantic changes:** ${finite(report.changeCount) ? report.changeCount : 0}`,
    "",
    "## Decision rationale",
    "",
    display(report.rationale),
    "",
    "## Architecture change summary",
    "",
    `- Components added: ${report.counts?.addedComponents ?? 0}`,
    `- Components removed: ${report.counts?.removedComponents ?? 0}`,
    `- Components modified: ${report.counts?.modifiedComponents ?? 0}`,
    `- Relationships added: ${report.counts?.addedRelationships ?? 0}`,
    `- Relationships removed: ${report.counts?.removedRelationships ?? 0}`,
    `- Relationships modified: ${report.counts?.modifiedRelationships ?? 0}`,
    "",
    "## Changed elements",
    "",
    ...(safeArray(report.changes).length ? safeArray(report.changes).map((change) => `- **${display(change.action)} ${display(change.subjectType)}:** ${display(change.label)}${change.detail ? ` — ${change.detail}` : ""}${safeArray(change.fields).length ? ` (fields: ${change.fields.join(", ")})` : ""}`) : ["No semantic change entries are available."]),
    "",
    "## Simulation comparison",
    "",
    `- **Status:** ${display(report.simulationStatus)}`,
    display(report.simulationReason),
    "",
    "| Metric | Baseline | Proposed | Delta | Direction |",
    "|---|---:|---:|---:|---|",
    ...(safeArray(report.metrics).length ? safeArray(report.metrics).map((metric) => `| ${metric.label} | ${formatMetricValue(metric.key, metric.before)} | ${formatMetricValue(metric.key, metric.after)} | ${formatMetricDelta(metric)} | ${display(metric.direction)} |`) : ["| — | — | — | — | Not available |"]),
    "",
    "## Bottleneck evidence",
    "",
    report.selectedScenarioLabel ? `Scenario: ${report.selectedScenarioLabel}` : "Scenario: unavailable",
    ...(safeArray(report.bottlenecks).length ? report.bottlenecks.map((item) => `- **${item.label}:** utilization ${item.peakUtilization == null ? "unavailable" : formatNumber(item.peakUtilization * 100, 1) + "%"}; p95 queue wait ${item.queueWaitP95Ms == null ? "unavailable" : formatNumber(item.queueWaitP95Ms) + " ms"}; dropped ${item.maxDropped}; failed ${item.maxFailed}.`) : ["No bottleneck evidence was provided."]),
    "",
    "## Selected trace evidence",
    "",
    ...(report.traceEvidence ? [`- Target: ${report.traceEvidence.label}`, `- Scenario: ${display(report.traceEvidence.scenarioLabel)}`, `- Outcome: ${display(report.traceEvidence.requestOutcome)}`, `- Operation: ${display(report.traceEvidence.operation)}`, `- Duration: ${report.traceEvidence.durationMs == null ? "Unavailable" : formatNumber(report.traceEvidence.durationMs) + " ms"}`, `- Service time: ${report.traceEvidence.serviceTimeMs == null ? "Unavailable" : formatNumber(report.traceEvidence.serviceTimeMs) + " ms"}`, `- Queue wait: ${report.traceEvidence.queueWaitMs == null ? "Unavailable" : formatNumber(report.traceEvidence.queueWaitMs) + " ms"}`] : ["No active trace investigation was available when the report was prepared."]),
    "",
    "## Optimization recommendations",
    "",
    ...(safeArray(report.recommendations).length ? report.recommendations.map((item, index) => `${index + 1}. **${item.label}** (${item.interventionKind}) — ${item.reason}`) : ["No evidence-guided intervention candidates are currently available."]),
    "",
    "## Optimization portfolio",
    "",
    ...(safeArray(report.portfolio).length ? report.portfolio.map((trial) => `- **#${trial.rank} ${trial.label}** (${trial.interventionKind}); directional score ${trial.score == null ? "unavailable" : (trial.score > 0 ? "+" : "") + trial.score + "%"}; outcome: ${display(trial.outcome)}. ${trial.limitations}`) : ["No completed comparable portfolio trials are included in this panel session."]),
    "",
    "## Risks and evidence gaps",
    "",
    ...(safeArray(report.risks).length ? report.risks.map((risk) => `- ${risk}`) : ["No additional risks were derived by this report."]),
    "",
    "## Recommended next steps",
    "",
    ...safeArray(report.nextSteps).map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Limitations",
    "",
    ...safeArray(report.limitations).map((item) => `- ${item}`),
    "",
    "---",
    "Generated by Sketchizi Workbench. Review model provenance, profile assumptions and workload scope before making a rollout decision.",
    "",
  ];
  return lines.join("\n");
}
