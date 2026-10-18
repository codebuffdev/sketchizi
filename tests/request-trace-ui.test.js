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
    ".sim-observation-boundary",
    ".sim-request-trace-summary",
    ".sim-request-trace-hops",
    ".sim-request-trace-hop.outcome-failed",
    ".sim-request-trace-hop.outcome-dropped",
    ".theme-dark .sim-request-traces",
  ]) assert.ok(css.includes(selector), `Missing request trace style ${selector}`);
  assert.match(css, /\.sim-request-trace-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
});


test("simulation result UI discloses synthetic assumptions and separates in-flight from terminal outcomes", async () => {
  const panel = await readSource("../src/features/simulation/experiments/SimulationExperimentPanel.jsx");
  assert.match(panel, /Uncalibrated synthetic model/);
  assert.match(panel, /Machine size, instance count and live resource usage are not discovered/);
  assert.match(panel, /In flight at window end/);
  assert.match(panel, /function ObservationBoundaryTable\(\{ run \}\)/);
  assert.match(panel, /Queued and in-service requests at the observation boundary/);
  assert.match(panel, /activeServiceRequests/);
  assert.match(panel, /queuedRequests/);
  assert.match(panel, /Do not add the in-flight figure to the final success, failure and drop totals/);
  assert.match(panel, /Final outcome totals and success rate include post-window drain/);
  assert.match(panel, /p95 latency includes successful requests completed during the drain/);
  assert.match(panel, /Non-zero timeout or retry settings are blocked/);
  assert.match(panel, /dependency-unavailable/);
  assert.match(panel, /component-failure/);
});
