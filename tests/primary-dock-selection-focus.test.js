import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const options = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("the complete sidebar remains available independently of canvas element selection", () => {
  const mount = canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "";
  assert.match(mount, /<PrimaryDock/);
  assert.doesNotMatch(mount, /selectedElements/);
  assert.match(dock, /TOOLS\.map\(\(tool\)/);
  assert.match(dock, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(dock, /focusedTool|selectedToolIds|selection-focus|sketchizi-radial-wheel/);
});

test("Escape still clears canvas selection independently of the sidebar", () => {
  assert.match(options, /handleEscapeToPrimaryDock/);
  assert.match(options, /selectedElementIds: \{\}/);
  assert.match(options, /selectedGroupIds: \{\}/);
  assert.match(dock, /sketchizi-tool-sidebar/);
});
