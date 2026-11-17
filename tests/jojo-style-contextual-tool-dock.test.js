import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = await readFile(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("Sketchizi mounts its own contextual tool options dock in the canvas", () => {
  assert.match(canvas, /<ToolOptionsDock apiRef=\{apiRef\} selectedElements=\{selectedElements\}/);
  assert.doesNotMatch(canvas, /<ContextualFormattingToolbar/);
});

test("the bottom dock exposes compact tool-specific controls, not a properties inspector", () => {
  assert.match(dock, /sketchizi-tool-options-dock/);
  assert.match(dock, /Stroke color/);
  assert.match(dock, /Fill style/);
  assert.match(dock, /Arrowheads/);
  assert.doesNotMatch(dock, /PropertiesPanel|properties-panel/);
});

test("Excalidraw's native selection properties panel is suppressed", () => {
  assert.match(css, /\.app \.excalidraw \.App-menu__left[\s\S]*?display: none !important/);
});
