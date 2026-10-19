import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");

test("saved experiment library exposes search, rename, selection, and comparison UI", () => {
  assert.match(panel, /Search saved experiments/);
  assert.match(panel, /renameSimulationHistoryEntry\(simulationHistory, entry\.id, nextName\)/);
  assert.match(panel, /Compare selected/);
  assert.match(panel, /compareSimulationHistoryEntries\(left, right\)/);
  assert.match(panel, /Saved run comparison/);
  assert.match(panel, /latest 5 retained/);
});

test("saved experiment library supports rerun against current model and reports metric regressions", () => {
  assert.match(panel, /Rerun on current model/);
  assert.match(panel, /runWorkbenchExperiments\(\{ workbench, simulationProfile: replayProfile/);
  assert.match(panel, /reproducibility-rerun/);
  assert.match(panel, /Rerun regression report/);
  assert.match(panel, /metricRegressions/);
  assert.match(panel, /original saved evidence was not overwritten/i);
});

test("rerun report displays a strict reproducibility verdict and provenance warnings", () => {
  assert.match(panel, /assessSimulationReproducibility\(entry, rerunEntry\)/);
  assert.match(panel, /Reproducibility assessment:/);
  assert.match(panel, /Exact match — provenance, scenario fingerprints, and recorded metrics match/);
  assert.match(panel, /Inconclusive — one or more scenarios are missing or incomplete/);
});
