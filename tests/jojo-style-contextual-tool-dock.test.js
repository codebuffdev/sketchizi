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
  assert.match(dock, /function ContextShapeIcon/);
  assert.match(dock, /<ContextShapeIcon type=\{type\}/);
  assert.doesNotMatch(dock, /<span className="sk-tool-dock-context">\{title\}<\/span>/);
  assert.match(dock, /Stroke color/);
  assert.match(dock, /Fill style/);
  assert.match(dock, /Arrowheads/);
  assert.doesNotMatch(dock, /PropertiesPanel|properties-panel/);
});

test("Excalidraw's native selection properties panel is suppressed", () => {
  assert.match(css, /\.app \.excalidraw \.App-menu__left[\s\S]*?display: none !important/);
});
test("Escape returns from contextual options to the primary selection dock", () => {
  assert.match(dock, /handleEscapeToPrimaryDock/);
  assert.match(dock, /event\.key !== "Escape"/);
  assert.match(dock, /activeTool: \{ type: "selection" \}/);
  assert.match(dock, /selectedElementIds: \{\}/);
  assert.match(dock, /setCustomTool\(null\)/);
});

test("both docks use a neutral theme-aware visual system with visible keyboard focus", () => {
  assert.match(css, /Contextual dock polish/);
  assert.match(css, /\.app\.theme-light \.sketchizi-tool-options-dock/);
  assert.match(css, /\.sk-tool-option-button:focus-visible/);
  assert.match(css, /Unify primary dock with neutral graphite styling|primary tool dock visually aligned/);
  assert.match(css, /#626b76/);
  assert.match(css, /#c0c7cf/);
});
