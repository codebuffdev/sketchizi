import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const options = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("the Primary Dock shows only the selected element's matching tool", () => {
  assert.match(canvas, /selectedElements=\{selectedElements\}/);
  assert.match(dock, /const focusedTool = selectedToolIds\.length/);
  assert.match(dock, /sketchizi-primary-dock-selection-focus/);
  assert.match(dock, /\{renderTool\(focusedTool\)\}/);
  assert.match(dock, /rectangle: "rectangle".*text: "text"/s);
  assert.match(dock, /\{!focusedTool && todoControl\}/);
});

test("Escape clears the element selection so the full Primary Dock returns", () => {
  assert.match(options, /handleEscapeToPrimaryDock/);
  assert.match(options, /selectedElementIds: \{\}/);
  assert.match(options, /selectedGroupIds: \{\}/);
  assert.match(dock, /\{GROUPS\.map\(\(group, groupIndex\) => \(/);
});
