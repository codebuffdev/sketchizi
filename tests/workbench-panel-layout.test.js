import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("Workbench has one shared scroll region with fixed header and footer", () => {
  assert.equal((panelSource.match(/className=\"workbench-panel-scroll\"/g) || []).length, 2, "welcome and active-model branches each need one scroll wrapper");
  assert.match(panelSource, /<header className=\"workbench-panel-header\">[\s\S]*?<div className=\"workbench-panel-scroll\">/);
  assert.match(panelSource, /<div className=\"workbench-panel-scroll\">[\s\S]*?<footer className=\"workbench-panel-footer\">/);
  assert.match(styles, /\.workbench-panel-scroll\s*\{[^}]*overflow-y:\s*auto/);
});

test("Workbench content sections do not create nested scroll areas or viewport height caps", () => {
  const selectors = [".workbench-components-section", ".workbench-inspector", ".workbench-findings", ".sim-experiment-panel"];
  for (const selector of selectors) {
    const rules = [...styles.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))];
    assert.ok(rules.length, `missing CSS rule for ${selector}`);
    for (const rule of rules) {
      assert.doesNotMatch(rule[1], /overflow-y:\s*auto|overflow:\s*auto|max-height:\s*\d/, `${selector} must not create an inner scrollbar or constrained viewport height`);
    }
  }
});


test("simulation panel gives explicit guidance when typed request links are missing", async () => {
  const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const guidanceHelper = await readFile(new URL("../src/features/simulation/experiments/typedRequestGuidance.js", import.meta.url), "utf8");
  assert.match(simulationPanel, /Connect the typed request path/);
  assert.match(simulationPanel, /arrows already drawn on the canvas are visual only unless they are linked to a Workbench relationship/);
  assert.match(guidanceHelper, /client-calls-service/);
  assert.match(guidanceHelper, /service-accesses-database/);
  assert.match(guidanceHelper, /relationKind: "calls"/);
  assert.match(simulationPanel, /Create \{link\.relationLabel === "Calls"/);
  assert.match(simulationPanel, /typedCallMissing/);
  assert.match(simulationPanel, /Warnings and context — not blockers/);
  assert.match(styles, /\.sim-typed-request-guidance\s*\{/);
});
