import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("selected-component context offers a direct action to the typed relationship editor", () => {
  assert.match(panel, /changePanelTab\("inspect", "workbench-create-relationship"\)/);
  assert.match(panel, /aria-label=\{`Create a relationship from \$\{selectedEntity\.name/);
  assert.match(panel, /id="workbench-create-relationship"/);
});

test("contextual relationship action remains responsive and keyboard focus is visible", () => {
  assert.match(css, /\.workbench-selection-context-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /#workbench-create-relationship:focus\s*\{[^}]*outline/s);
});
