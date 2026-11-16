import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const overlay = readFileSync(new URL("../src/components/app/ShapeMeasurements.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/app/ShapeMeasurements.css", import.meta.url), "utf8");
test("ellipse selection shows radius instead of bounding-box labels", () => {
  assert.match(overlay, /bounds\.type === "ellipse"/);
  assert.match(overlay, /const radiusX = bounds\.width \/ 2/);
  assert.match(overlay, /const radiusY = bounds\.height \/ 2/);
  assert.match(overlay, /isCircle \? `r = /);
  assert.match(overlay, /`rx = /);
  assert.match(overlay, /`ry = /);
  assert.match(overlay, /isEllipse \? \(/);
});
test("radius guides are non-interactive and other shapes keep dimensions", () => {
  assert.match(css, /\.sk-shape-radius-guide\{[^}]*pointer-events:none/);
  assert.match(overlay, /formatCm\(bounds\.width\)/);
  assert.match(overlay, /formatCm\(bounds\.height\)/);
  assert.match(overlay, /Math\.abs\(bounds\.angle\) > 0\.001/);
});
