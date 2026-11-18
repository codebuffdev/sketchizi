import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("sloppiness dropdown is available for shapes, lines, arrows, and draw-to-shape", () => {
  assert.match(dock, /const isShape = \["rectangle", "diamond", "ellipse"\]\.includes\(type\)/);
  assert.match(dock, /const isLine = \["line", "arrow"\]\.includes\(type\)/);
  assert.match(dock, /\{\(isShape \|\| isLine \|\| isAutoShape\) && <DockGroup label="Sloppiness">/);
  assert.match(dock, /<DockSelect label="Sloppiness"/);
  assert.match(dock, /<option value=\{0\}>Architect<\/option>/);
  assert.match(dock, /<option value=\{1\}>Artist<\/option>/);
  assert.match(dock, /<option value=\{2\}>Cartoonist<\/option>/);
});

test("sloppiness changes selected elements and the active drawing tool", () => {
  assert.match(dock, /roughness: "currentItemRoughness"/);
  assert.match(dock, /onChange=\{\(event\) => update\(\{ roughness: Number\(event\.target\.value\) \}\)\}/);
  assert.match(dock, /const roughness = Number\(current\("roughness", "currentItemRoughness", 1\)\)/);
});

test("mutually exclusive contextual style choices use compact dropdowns", () => {
  for (const label of ["Stroke width", "Stroke style", "Fill style", "Corners", "Pen pressure"]) {
    assert.match(dock, new RegExp(`<DockSelect label="${label}"`));
  }
  assert.doesNotMatch(dock, /WIDTHS\.map\(\(width\) => <ToolButton/);
  assert.doesNotMatch(dock, /LINE_STYLES\.map\(\(\[value, label\]\) => <ToolButton/);
  assert.doesNotMatch(dock, /FILL_STYLES\.map\(\(\[value, label\]\) => <ToolButton/);
});

test("contextual option selectors render icon-first triggers with accessible native selects", () => {
  assert.match(dock, /function DockSelect\(\{ label, value, onChange, icon, children \}\)/);
  assert.match(dock, /className="sk-tool-icon-select-preview"/);
  assert.match(dock, /<select aria-label=\{label\} value=\{value\} onChange=\{onChange\}>/);
  assert.match(dock, /className="sk-tool-icon-select-chevron"/);
  assert.doesNotMatch(dock, /<option value=\{0\}>Architect<\/option>\s*<\/select>\s*<\/DockGroup>/);
});
