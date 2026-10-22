const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value) => Math.max(-100, Math.min(100, value));

function relativeChange(metric, lowerIsBetter = false) {
  const before = metric?.before;
  const after = metric?.after;
  if (!finite(before) || !finite(after)) return null;
  if (before === 0) {
    if (after === 0) return 0;
    return lowerIsBetter ? (after < before ? 100 : -100) : (after > before ? 100 : -100);
  }
  const change = ((after - before) / Math.abs(before)) * 100;
  return clamp(lowerIsBetter ? -change : change);
}

/**
 * Build a comparable, session-local portfolio from completed controlled trials.
 * Positive score means directional improvement across available metrics; missing
 * metrics are omitted rather than filled with fabricated values.
 */
export function buildOptimizationPortfolio(trials = []) {
  const normalized = (Array.isArray(trials) ? trials : []).filter((trial) => trial?.comparison?.status === "ready").map((trial, index) => {
    const metrics = trial.comparison.metrics || [];
    const metric = (key) => metrics.find((item) => item.key === key);
    const throughput = relativeChange(metric("throughputRps"));
    const latency = relativeChange(metric("p95LatencyMs"), true);
    const dropped = relativeChange(metric("droppedRequests"), true);
    const success = relativeChange(metric("successRate"));
    const offered = metric("offeredRequests")?.before;
    const failedBefore = metric("failedRequests")?.before;
    const failedAfter = metric("failedRequests")?.after;
    const errorRateBefore = finite(offered) && offered > 0 && finite(failedBefore) ? (failedBefore / offered) * 100 : null;
    const errorRateAfter = finite(offered) && offered > 0 && finite(failedAfter) ? (failedAfter / offered) * 100 : null;
    const errorRateDeltaPercentagePoints = finite(errorRateBefore) && finite(errorRateAfter) ? Number((errorRateAfter - errorRateBefore).toFixed(4)) : null;
    const available = [throughput, latency, dropped, success].filter(finite);
    const score = available.length ? Number((available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(2)) : null;
    return {
      id: trial.id || `${trial.interventionKind || "trial"}-${trial.createdAt || index}`,
      label: trial.label || trial.componentName || trial.interventionKind || "Optimization trial",
      interventionKind: trial.interventionKind || "unknown",
      scenarioLabel: trial.comparisonScenarioLabel || "Selected scenario",
      outcome: trial.outcomeSummary?.status || "inconclusive",
      createdAt: trial.createdAt || null,
      score,
      metrics: {
        throughputDeltaPercent: throughput,
        p95LatencyDeltaPercent: latency,
        droppedRequestsDeltaPercent: dropped,
        successRateDeltaPercent: success,
        errorRateDeltaPercentagePoints,
      },
      limitations: trial.modelingLimit || trial.evidence?.modelingLimit || "Synthetic controlled what-if; validate with production measurements.",
    };
  });
  return normalized.sort((a, b) => {
    if (a.score === null && b.score !== null) return 1;
    if (b.score === null && a.score !== null) return -1;
    return (b.score ?? 0) - (a.score ?? 0) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  }).map((trial, index) => ({ ...trial, rank: index + 1 }));
}
