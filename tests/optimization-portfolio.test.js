import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOptimizationPortfolio } from "../src/features/simulation/experiments/optimizationPortfolio.js";

function trial(id, { throughput = [100, 110], latency = [200, 160], drops = [10, 5], success = [0.9, 0.95], failed = [10, 5], outcome = "improved" } = {}) {
  return {
    id, label: id, interventionKind: "capacity", comparisonScenarioLabel: "Traffic surge", outcomeSummary: { status: outcome },
    comparison: { status: "ready", metrics: [
      { key: "offeredRequests", before: 100, after: 100 },
      { key: "throughputRps", before: throughput[0], after: throughput[1] },
      { key: "p95LatencyMs", before: latency[0], after: latency[1] },
      { key: "droppedRequests", before: drops[0], after: drops[1] },
      { key: "successRate", before: success[0], after: success[1] },
      { key: "failedRequests", before: failed[0], after: failed[1] },
    ] },
  };
}

test("portfolio ranks comparable trials by directional throughput, latency, drops and success changes", () => {
  const ranked = buildOptimizationPortfolio([trial("mixed", { throughput: [100, 102], latency: [200, 210], drops: [10, 12], success: [0.9, 0.89], outcome: "mixed" }), trial("best"), trial("weak", { throughput: [100, 101], latency: [200, 195], drops: [10, 9], success: [0.9, 0.91] })]);
  assert.equal(ranked[0].id, "best");
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked.at(-1).id, "mixed");
  assert.equal(ranked[0].metrics.errorRateDeltaPercentagePoints, -5);
});

test("portfolio ignores incomplete trials and preserves unavailable metrics", () => {
  assert.deepEqual(buildOptimizationPortfolio([{ id: "blocked", comparison: { status: "unavailable" } }]), []);
  const [entry] = buildOptimizationPortfolio([{ id: "partial", comparison: { status: "ready", metrics: [{ key: "throughputRps", before: 0, after: 0 }] } }]);
  assert.equal(entry.score, 0);
  assert.equal(entry.metrics.p95LatencyDeltaPercent, null);
  assert.equal(entry.metrics.errorRateDeltaPercentagePoints, null);
});

test("portfolio describes failure-rate change as percentage points, not a claimed SLO budget", () => {
  const [entry] = buildOptimizationPortfolio([trial("trial")]);
  assert.equal(entry.metrics.errorRateDeltaPercentagePoints, -5);
  assert.match(entry.limitations, /Synthetic controlled/);
});

test("simulation panel renders a ranked portfolio with trade-off and failure-rate caveats", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /OPTIMIZATION PORTFOLIO/);
  assert.match(panel, /Failure-rate proxy is failed requests divided by the baseline offered-request count/);
  assert.match(panel, /Clear portfolio/);
  assert.match(panel, /buildOptimizationPortfolio\(optimizationPortfolioTrials\)/);
});
