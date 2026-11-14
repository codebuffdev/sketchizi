import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/components/app/PrecisionToolbar.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/app/PrecisionToolbar.css", import.meta.url), "utf8");
test("snap increments are optional and applied in scene coordinates", () => {
  assert.match(source, /snapEnabled && increment > 0/);
  assert.match(source, /snapToIncrement\(rawPoint\.x, increment\)/);
  assert.match(source, /cmToScenePx\(snapCm\)/);
});
test("measurement guides display captured points without intercepting pointer events", () => {
  assert.match(source, /sk-precision-guide/);
  assert.match(source, /<polyline/);
  assert.match(source, /setGuide\(\{ mode, points: next \}\)/);
  assert.match(styles, /pointer-events:none/);
});
