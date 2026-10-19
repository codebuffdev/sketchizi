import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");

test("simulation panel exposes the six-point traffic sweep and its result metrics", () => {
  assert.match(panelSource, /Run 6-point traffic sweep/);
  assert.match(panelSource, /aria-label="Traffic sweep results"/);
  assert.match(panelSource, /trafficSweepResults\.points\.map/);
  assert.match(panelSource, /Throughput/);
  assert.match(panelSource, /p95 latency/);
  assert.match(panelSource, /Failed requests/);
  assert.match(panelSource, /Set SLOs/);
});

test("traffic sweep UI warns when the current model, profile, or targets invalidate results", () => {
  assert.match(panelSource, /trafficSweepStale/);
  assert.match(panelSource, /model, profile or SLO targets have changed since this sweep/);
  assert.match(panelSource, /Rerun it before using these results/);
});


test("simulation panel exposes a resilience matrix and stale-result warning", () => {
  assert.match(panelSource, /Run resilience matrix/);
  assert.match(panelSource, /aria-label="Resilience matrix results"/);
  assert.match(panelSource, /resilienceMatrixStale/);
  assert.match(panelSource, /runResilienceMatrix/);
});

test("simulation panel exposes pairwise failure-chain experiments and interaction interpretation", () => {
  assert.match(panelSource, /Run failure-chain matrix/);
  assert.match(panelSource, /aria-label="Failure-chain experiment results"/);
  assert.match(panelSource, /failureChainStale/);
  assert.match(panelSource, /runFailureChainMatrix/);
  assert.match(panelSource, /Worse than either alone/);
  assert.match(panelSource, /not every possible pair was evaluated/);
});

test("simulation experiment panels expose portable JSON evidence exports", () => {
  assert.match(panelSource, /Export evidence JSON/);
  assert.match(panelSource, /downloadSimulationEvidence\("failure-chain-matrix"/);
  assert.match(panelSource, /downloadSimulationEvidence\("resilience-matrix"/);
  assert.match(panelSource, /downloadSimulationEvidence\("traffic-sweep"/);
  assert.match(panelSource, /createSimulationEvidenceReport/);
});
