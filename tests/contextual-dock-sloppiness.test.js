import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("DockSelect remains defined for the other contextual controls", () => {
  assert.match(dock, /function DockSelect\\(\\{ label, value, onChange, icon, children \\}\\)/);
});

test("sloppiness dropdown is available for shapes, lines, arrows, and draw-to-shape", () => {
  assert.match(dock, /const isShape = \["rectangle", "diamond", "ellipse"\]\.includes\(type\)/);
  assert.match(dock, /const isLine = \["line", "arrow"\]\.includes\(type\)/);
  assert.match(dock, /\{\(isShape \|\| isLine \|\| isAutoShape\) && <DockGroup label="Sloppiness">/);
  assert.match(dock, /<VisualOptionSelect label="Sloppiness"/);
  for (const label of ["Architect", "Artist", "Cartoonist"]) assert.ok(dock.includes(`label: "${label}"`));
});

test("sloppiness changes selected elements and the active drawing tool", () => {
  assert.match(dock, /roughness: "currentItemRoughness"/);
  assert.match(dock, /onChange=\{\(value\) => update\(\{ roughness: Number\(value\) \}\)\}/);
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

test("stroke style and sloppiness use visual option menus with accessible names", () => {
  assert.match(dock, /function VisualOptionSelect\(\{ label, value, onChange, kind, options \}\)/);
  assert.match(dock, /role="listbox" aria-label=\{label\}/);
  assert.match(dock, /aria-label=\{option\.label\} title=\{option\.label\}/);
  assert.match(dock, /kind="line-style"/);
  assert.match(dock, /kind="roughness"/);
});


test("all contextual setting dropdowns are icon-only custom menus", () => {
  assert.match(dock, /function DockOptionGlyph\(\{ label, value \}\)/);
  assert.match(dock, /function DockSelect\(\{ label, value, onChange, icon, children \}\)/);
  assert.match(dock, /role="listbox" aria-label=\{label\}/);
  assert.match(dock, /role="option"/);
  assert.doesNotMatch(dock.slice(dock.indexOf("function DockSelect("), dock.indexOf("\nfunction OptionGlyph")), /<select/);
  for (const label of ["Stroke width", "Fill style", "Corners", "Start arrowhead", "End arrowhead", "Font family", "Pen pressure"]) {
    assert.ok(dock.includes(`label="${label}"`), `missing icon dropdown for ${label}`);
  }
});

test("icon dropdowns expose selection state and dismiss on outside click or Escape", () => {
  assert.match(dock, /aria-selected=\{String\(option\.value\) === String\(value\)\}/);
  assert.match(dock, /event\.key === "Escape"/);
  assert.match(dock, /event\.type === "pointerdown"/);
});


test("custom dropdowns safely normalize option children and empty option lists", () => {
  assert.match(c.result.content, /Children\.toArray\(children\)/);
  assert.match(c.result.content, /isValidElement\(child\) && child\.props\?\.value !== undefined/);
  assert.match(c.result.content, /\|\| \{ value: \"\", label \}/);
  assert.match(c.result.content, /safeOptions = Array\.isArray\(options\)/);
  assert.match(c.result.content, /\|\| safeOptions\[0\] \|\| \{ value: 0, label \}/);
});

test("dropdown option selection passes the raw value and stops canvas pointer handling", () => {
  assert.doesNotMatch(dock, /onChange\(\{ target: \{ value: option\.value \} \}\)/);
  assert.equal((dock.match(/onPointerDown=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); onChange\(option\.value\); setOpen\(false\); \}\}/g) || []).length, 2);
  for (const label of ["Stroke width", "Fill style", "Corners", "Start arrowhead", "End arrowhead", "Font family", "Pen pressure"]) {
    assert.match(dock, new RegExp(`<DockSelect label="${label}" value=[^>]*onChange=\\{\\(value\\) =>`));
  }
});
