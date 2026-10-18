import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("request-level inspector is wired to the selected scenario's recorded traces", async () => {
  const panel = await readSource("../src/features/simulation/experiments/SimulationExperimentPanel.jsx");
  assert.match(panel, /function RequestTraceExplorer\(\{ run, scenarioKey, onFocusEntity, onInvestigateTrace, investigation \}\)/);
  assert.match(panel, /run\?\.result\?\.result\?\.requestTraces/);
  assert.match(panel, /aria-label="Select request trace"/);
  assert.match(panel, /onFocusEntity\?\.\(hop\.entityId\)/);
  assert.match(panel, /Investigate on charts & canvas/);
  assert.match(panel, /findTraceWindowBucketRange/);
  assert.match(panel, /sim-time-chart-investigation-window/);
  assert.match(panel, /Traffic offered/);
  assert.match(panel, /Queue wait/);
  assert.match(panel, /Service time/);
  assert.match(panel, /Service ended \/ outcome/);
  assert.match(panel, /withinObservationWindow/);
  assert.match(panel, /<RequestTraceExplorer key=\{activeRunKey\} run=\{activeRun\}/);
  assert.match(panel, /not a full distributed trace of a deployed service/);
});

test("request-level inspector uses compact, responsive styles and explicit outcome states", async () => {
  const css = await readSource("../src/styles/workbench.css");
  for (const selector of [
    ".sim-request-traces",
    ".sim-request-trace-summary",
    ".sim-request-trace-hops",
    ".sim-request-trace-hop.outcome-failed",
    ".sim-request-trace-hop.outcome-dropped",
    ".theme-dark .sim-request-traces",
  ]) assert.ok(css.includes(selector), `Missing request trace style ${selector}`);
  assert.match(css, /\.sim-request-trace-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
});
