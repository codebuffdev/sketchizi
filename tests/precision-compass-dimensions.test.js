import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const toolbar = readFileSync(new URL("../src/components/app/PrecisionToolbar.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
test("compass uses a positive centimeter radius and creates an ellipse centered on click", () => {
  assert.match(toolbar, /id: "compass"/);
  assert.match(toolbar, /cmToScenePx\(radiusCm\)/);
  assert.match(toolbar, /x: center\.x - radius, y: center\.y - radius/);
  assert.match(toolbar, /width: radius \* 2, height: radius \* 2/);
  assert.match(toolbar, /api\.updateScene/);
});
test("exact dimension controls update only the selected shape", () => {
  assert.match(canvas, /selectedElements=\{selectedElements\}/);
  assert.match(toolbar, /element\.id === editableShape\.id/);
  assert.match(toolbar, /width === null \|\| height === null \|\| width <= 0 \|\| height <= 0/);
  assert.match(toolbar, /versionNonce:/);
});
