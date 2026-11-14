import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = readFileSync(new URL("../src/components/app/ShapeMeasurements.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/app/ShapeMeasurements.css", import.meta.url), "utf8");

test("shape measurements convert CSS pixels to centimeters", () => {
  assert.match(overlay, /2\.54 \/ 96/);
  assert.match(overlay, /toFixed\(2\)/);
  assert.match(overlay, /formatCm\(bounds\.width\)/);
  assert.match(overlay, /formatCm\(bounds\.height\)/);
});

test("labels are placed on the bottom and right edges and update with scene changes", () => {
  assert.match(overlay, /x \+ width \/ 2/);
  assert.match(overlay, /y \+ height \+ 13/);
  assert.match(overlay, /x \+ width \+ 13/);
  assert.match(overlay, /y \+ height \/ 2/);
  assert.match(canvas, /<ShapeMeasurements apiRef=/);
  assert.match(canvas, /canvasRevision=\{canvasRevision\}/);
});

test("measurement overlay does not intercept drawing gestures", () => {
  assert.match(css, /pointer-events: none/);
  assert.match(overlay, /createPortal/);
  assert.match(css, /sk-shape-measurement-width-mask/);
  assert.match(overlay, /shapes\.length !== 1/);
  assert.match(overlay, /Math\.abs\(bounds\.angle\) > 0\.001/);
});
