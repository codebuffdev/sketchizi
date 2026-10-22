import test from "node:test";
import assert from "node:assert/strict";
import { calculateSloBudgetMetrics } from "../src/features/simulation/experiments/sloBudgetAnalysis.js";

test("calculates positive latency headroom and remaining error budget", () => {
  const result = calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: 80, failedRatePercent: 1, maxP95LatencyMs: 100, maxErrorRatePercent: 2 });
  assert.deepEqual(result, {
    evaluated: true,
    latencyHeadroomMs: 20,
    latencyHeadroomPercent: 20,
    errorBudgetRemainingPercentagePoints: 1,
    errorBudgetRemainingPercent: 50,
    errorBudgetUsedPercent: 50,
    errorBudgetStatus: "within-budget",
  });
});

test("reports negative headroom and negative remaining budget when targets are exceeded", () => {
  const result = calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: 125, failedRatePercent: 3, maxP95LatencyMs: 100, maxErrorRatePercent: 2 });
  assert.equal(result.latencyHeadroomMs, -25);
  assert.equal(result.latencyHeadroomPercent, -25);
  assert.equal(result.errorBudgetRemainingPercentagePoints, -1);
  assert.equal(result.errorBudgetRemainingPercent, -50);
  assert.equal(result.errorBudgetUsedPercent, 150);
  assert.equal(result.errorBudgetStatus, "exhausted");
});

test("zero-percent error target is evaluated without dividing by zero", () => {
  const met = calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: 20, failedRatePercent: 0, maxP95LatencyMs: 50, maxErrorRatePercent: 0 });
  assert.equal(met.errorBudgetStatus, "within-budget");
  assert.equal(met.errorBudgetRemainingPercentagePoints, 0);
  assert.equal(met.errorBudgetRemainingPercent, null);
  assert.equal(met.errorBudgetUsedPercent, null);
  const exceeded = calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: 20, failedRatePercent: 0.1, maxP95LatencyMs: 50, maxErrorRatePercent: 0 });
  assert.equal(exceeded.errorBudgetStatus, "exhausted");
});

test("missing targets or incomplete observations remain unevaluated", () => {
  assert.equal(calculateSloBudgetMetrics({}).evaluated, false);
  assert.equal(calculateSloBudgetMetrics({ status: "blocked", p95LatencyMs: 10, failedRatePercent: 0, maxP95LatencyMs: 20, maxErrorRatePercent: 1 }).latencyHeadroomMs, null);
  assert.equal(calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: null, failedRatePercent: 0, maxP95LatencyMs: 20, maxErrorRatePercent: 1 }).evaluated, false);
});

test("rejects invalid thresholds rather than manufacturing a budget", () => {
  for (const options of [
    { maxP95LatencyMs: 0, maxErrorRatePercent: 1 },
    { maxP95LatencyMs: 10, maxErrorRatePercent: -1 },
    { maxP95LatencyMs: 10, maxErrorRatePercent: 101 },
  ]) {
    assert.equal(calculateSloBudgetMetrics({ status: "completed", p95LatencyMs: 1, failedRatePercent: 0, ...options }).evaluated, false);
  }
});
