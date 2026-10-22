/**
 * Calculate transparent SLO headroom for a completed synthetic scenario.
 * These are arithmetic comparisons against user-provided targets, not a claim
 * that a synthetic run predicts production behavior.
 */
export function calculateSloBudgetMetrics({
  status,
  p95LatencyMs,
  failedRatePercent,
  maxP95LatencyMs,
  maxErrorRatePercent,
} = {}) {
  const targetsValid = Number.isFinite(maxP95LatencyMs) && maxP95LatencyMs > 0
    && Number.isFinite(maxErrorRatePercent) && maxErrorRatePercent >= 0 && maxErrorRatePercent <= 100;
  const observationsValid = status === "completed"
    && Number.isFinite(p95LatencyMs) && p95LatencyMs >= 0
    && Number.isFinite(failedRatePercent) && failedRatePercent >= 0 && failedRatePercent <= 100;
  if (!targetsValid || !observationsValid) {
    return {
      evaluated: false,
      latencyHeadroomMs: null,
      latencyHeadroomPercent: null,
      errorBudgetRemainingPercentagePoints: null,
      errorBudgetRemainingPercent: null,
      errorBudgetUsedPercent: null,
      errorBudgetStatus: "not-evaluated",
    };
  }

  const latencyHeadroomMs = maxP95LatencyMs - p95LatencyMs;
  const latencyHeadroomPercent = (latencyHeadroomMs / maxP95LatencyMs) * 100;
  const errorBudgetRemainingPercentagePoints = maxErrorRatePercent - failedRatePercent;
  const errorBudgetStatus = failedRatePercent <= maxErrorRatePercent ? "within-budget" : "exhausted";

  // A zero-percent error target has no divisible percentage budget. Preserve
  // the pass/fail comparison, but don't fabricate a percentage-used value.
  const hasPositiveErrorBudget = maxErrorRatePercent > 0;
  return {
    evaluated: true,
    latencyHeadroomMs,
    latencyHeadroomPercent,
    errorBudgetRemainingPercentagePoints,
    errorBudgetRemainingPercent: hasPositiveErrorBudget
      ? (errorBudgetRemainingPercentagePoints / maxErrorRatePercent) * 100
      : null,
    errorBudgetUsedPercent: hasPositiveErrorBudget
      ? (failedRatePercent / maxErrorRatePercent) * 100
      : null,
    errorBudgetStatus,
  };
}
