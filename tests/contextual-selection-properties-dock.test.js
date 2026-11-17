import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
const properties = await readFile(new URL("../src/PropertiesPanel.jsx", import.meta.url), "utf8");
const dockCss = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("selected element properties use the full PropertiesPanel inside the canvas dock", () => {
  assert.match(app, /selectionProperties=\{[\s\S]*?<PropertiesPanel/);
  assert.match(app, /hideDuplicateFormattingControls=\{false\}/);
  assert.match(app, /dockMode/);
  assert.match(toolbar, /showSelectionProperties = liveSelection\.length > 0 && Boolean\(selectionProperties\)/);
  assert.match(toolbar, /className="sketchizi-selection-properties-dock"/);
  assert.match(toolbar, /data-dock-mode=\{showSelectionProperties \? "selection-properties" : "tool-options"\}/);
});

test("the native selection panel is replaced by a bottom-right Sketchizi properties dock", () => {
  assert.match(dockCss, /\.properties-panel\.properties-panel-dock[\s\S]*?position: relative !important/);
  assert.match(dockCss, /\.contextual-formatting-toolbar\.has-selection-properties[\s\S]*?width: min\(360px/);
  assert.match(dockCss, /\.App-menu__left[\s\S]*?display: none !important/);
  assert.match(properties, /dockMode = false/);
  assert.match(properties, /!dockMode && \(/);
});

test("contextual controls are available outside Zen Mode", () => {
  assert.match(canvas, /<ContextualFormattingToolbar[\s\S]*?selectionProperties=\{selectionProperties\}/);
  assert.doesNotMatch(canvas, /zenModeEnabled\?\.\(\) \?\? true\) && \(/);
});

test("left-dock shape and connector tools expose their own drawing defaults", () => {
  assert.match(toolbar, /const shapeTool = \["rectangle", "diamond", "ellipse"\]/);
  assert.match(toolbar, /const lineTool = \["line", "arrow"\]/);
  assert.match(toolbar, /liveSelection\.length === 0 && \(drawingTool \|\| shapeTool \|\| lineTool/);
  assert.match(toolbar, /activeToolMode === "shape"/);
  assert.match(toolbar, /activeToolMode === "line"/);
  assert.match(toolbar, /currentItemStartArrowhead/);
  assert.match(toolbar, /currentItemStrokeStyle/);
});
