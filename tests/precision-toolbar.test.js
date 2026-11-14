import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const toolbar = readFileSync(new URL("../src/components/app/PrecisionToolbar.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
test("ruler and protractor use scene coordinates and never modify scene", () => {
  assert.match(toolbar, /id: "ruler"/);
  assert.match(toolbar, /id: "protractor"/);
  assert.match(toolbar, /scenePxToCm/);
  assert.match(toolbar, /lineAngleDegrees/);
  assert.match(toolbar, /state\.scrollX/);
  assert.doesNotMatch(toolbar, /updateScene|addElement/);
});
test("precision controls mount only in editable canvas and can exit", () => {
  assert.match(canvas, /<PrecisionToolbar apiRef=/);
  assert.match(toolbar, /if \(!canEdit \|\| viewModeEnabled\) return null/);
  assert.match(toolbar, /event\.key === "Escape"/);
  assert.match(toolbar, /aria-pressed=/);
});
