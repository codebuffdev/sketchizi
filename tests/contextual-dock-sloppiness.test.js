import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("sloppiness control is available for shapes, lines, arrows, and draw-to-shape", () => {
  assert.match(dock, /const isShape = \["rectangle", "diamond", "ellipse"\]\.includes\(type\)/);
  assert.match(dock, /const isLine = \["line", "arrow"\]\.includes\(type\)/);
  assert.match(dock, /\{\(isShape \|\| isLine \|\| isAutoShape\) && <DockGroup label="Sloppiness">/);
  assert.match(dock, /\[0, 1, 2\]\.map\(\(value\) => <ToolButton/);
});

test("sloppiness changes selected elements and the active drawing tool", () => {
  assert.match(dock, /roughness: "currentItemRoughness"/);
  assert.match(dock, /onClick=\{\(\) => update\(\{ roughness: value \}\)\}/);
  assert.match(dock, /const roughness = Number\(current\("roughness", "currentItemRoughness", 1\)\)/);
});
