import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");

test("saved evidence comparison UI accepts two JSON reports and shows provenance warnings", () => {
  assert.match(panel, /aria-label="Saved experiment comparison"/);
  assert.match(panel, /accept="application\/json,\.json" multiple/);
  assert.match(panel, /compareSimulationEvidenceReports\(left, right\)/);
  assert.match(panel, /Comparability warnings/);
  assert.match(panel, /Throughput Δ \(req\/s\)/);
  assert.match(panel, /Clear comparison/);
});
