import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const options = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("the full radial wheel remains visible regardless of element selection", () => {
  assert.doesNotMatch(canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "", /selectedElements/);
  assert.match(dock, /TOOLS\.map\(\(tool, index\)/);
  assert.doesNotMatch(dock, /focusedTool|selectedToolIds|selection-focus/);
});

test("Escape still clears canvas selection independently of the tool wheel", () => {
  assert.match(options, /handleEscapeToPrimaryDock/);
  assert.match(options, /selectedElementIds: \{\}/);
  assert.match(options, /selectedGroupIds: \{\}/);
  assert.match(dock, /sketchizi-radial-wheel/);
});
