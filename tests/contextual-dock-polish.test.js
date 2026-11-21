import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/contextual-dock-polish.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const dockSource = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("polish stylesheet is imported after the base dock styles", () => {
  assert.match(app, /import "\.\/styles\/contextual-dock-polish\.css"/);
  assert.ok(app.indexOf("canvas-tabs-dock.css") < app.indexOf("contextual-dock-polish.css"));
});

test("all dock controls share one control size matching the 32px primary dock", () => {
  assert.match(css, /--sk-ctx-control:\s*32px/);
  for (const selector of ["sk-tool-option-button", "sk-tool-choice-trigger", "sk-tool-layer-trigger", "sk-tool-text-size-step"]) {
    assert.ok(css.includes(`.${selector}`), `${selector} must use the shared size`);
  }
  assert.match(css, /height:\s*var\(--sk-ctx-control\) !important/);
});

test("selected, hover-safe disabled and focus states are defined", () => {
  assert.match(css, /\.is-active[\s\S]*background:\s*var\(--sk-ctx-accent-bg\)/);
  assert.match(css, /button:disabled[\s\S]*cursor:\s*not-allowed/);
  assert.match(css, /pointer-events:\s*none/);
});

test("dock keeps clear of the zoom/date row on every width", () => {
  assert.match(css, /max-width:\s*calc\(100% - \(var\(--sk-ctx-corner-clear\) \* 2\)\)/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*bottom:\s*calc\(18px \+ var\(--canvas-corner-row-height, 36px\) \+ 8px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*bottom:\s*calc\(12px \+ var\(--canvas-corner-row-height, 36px\) \+ 8px\)/);
});

test("properties dock starts directly with styling controls and has uniform horizontal padding", () => {
  assert.doesNotMatch(dockSource, /sk-tool-dock-context|ContextShapeIcon/);
  assert.ok(dockSource.includes('data-tool={type}>\n      <DockGroup label="Stroke color">'));
  assert.ok(css.includes("padding: 5px 12px !important;"));
  assert.ok(css.includes(".sketchizi-tool-options-dock > .sk-tool-dock-group:first-of-type {\n  margin-left: 0;\n  padding-left: 0 !important;"));
  assert.ok(css.includes(".sketchizi-tool-options-dock > .sk-tool-dock-group:first-of-type::before { display: none; }"));
});

test("polish is visual only: no controls hidden or removed", () => {
  assert.doesNotMatch(css, /display:\s*none\s*!?i?m?p?o?r?t?a?n?t?;?[^}]*sk-tool-option-button/);
  for (const name of ["sk-tool-layer-control", "sk-tool-text-size", "sk-tool-color-dot", "sk-tool-choice", "sk-tool-dock-opacity-value"]) {
    assert.ok(dockSource.includes(name), `${name} must still exist in the dock`);
  }
  assert.doesNotMatch(css, /radial/i, "must not reintroduce the old radial dock");
});
