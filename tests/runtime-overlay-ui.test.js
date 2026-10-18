import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("completed simulation results flow from Run to the canvas overlay without changing model elements", async () => {
  const [app, workbenchPanel, simulationPanel, canvas] = await Promise.all([
    readSource("../src/App.jsx"),
    readSource("../src/features/workbench/WorkbenchPanel.jsx"),
    readSource("../src/features/simulation/experiments/SimulationExperimentPanel.jsx"),
    readSource("../src/components/app/SketchiziCanvas.jsx"),
  ]);
  assert.match(app, /runtimeOverlay=\{workbenchRuntimeOverlay\}/);
  assert.match(app, /onRuntimeOverlayChange=\{setWorkbenchRuntimeOverlay\}/);
  assert.match(workbenchPanel, /onRuntimeOverlayChange=\{onRuntimeOverlayChange\}/);
  assert.match(simulationPanel, /buildRuntimeOverlayModel\(/);
  assert.match(simulationPanel, /onRuntimeOverlayChange\?\.\(runtimeOverlayModel\)/);
  assert.match(canvas, /className="workbench-runtime-overlay-layer"/);
  assert.match(canvas, /onClick=\{\(\) => onFocusRuntimeEntity\?\.\(card\.entityId\)\}/);
  assert.match(canvas, /card\.investigated \? " is-investigated"/);
  assert.match(canvas, /TRACE FOCUS/);
  assert.doesNotMatch(canvas, /apiRef\.current\?\.updateScene/);
});

test("runtime overlay styles have explicit pressure, failure, warning, source and theme variants", async () => {
  const css = await readSource("../src/styles/workbench.css");
  for (const selector of [".workbench-runtime-overlay-layer", ".workbench-runtime-overlay-card.pressure", ".workbench-runtime-overlay-card.failure", ".workbench-runtime-overlay-card.warning", ".workbench-runtime-overlay-card.source", ".theme-dark .workbench-runtime-overlay-card.pressure"]) {
    assert.ok(css.includes(selector), `Missing runtime overlay style: ${selector}`);
  }
});
