import test from "node:test";
import assert from "node:assert/strict";
import {
  toCanvasArrowhead, toUiArrowhead, normalizeArrowheadPatch, swapArrowheadsPatch,
} from "../src/features/canvas/arrowheads.js";

test("dot is written as the circle value the renderer draws", () => {
  assert.equal(toCanvasArrowhead("dot"), "circle");
  assert.equal(toCanvasArrowhead("arrow"), "arrow");
  assert.equal(toCanvasArrowhead("none"), null);
  assert.equal(toCanvasArrowhead(undefined), null);
});

test("circle and legacy dot both show as Dot in the UI", () => {
  assert.equal(toUiArrowhead("circle"), "dot");
  assert.equal(toUiArrowhead("dot"), "dot");
  assert.equal(toUiArrowhead(null), "none");
  assert.equal(toUiArrowhead("bar"), "bar");
});

test("patch normalization only touches arrowhead keys", () => {
  assert.deepEqual(normalizeArrowheadPatch({ endArrowhead: "dot", strokeWidth: 2 }), { endArrowhead: "circle", strokeWidth: 2 });
  const untouched = { strokeColor: "#000" };
  assert.equal(normalizeArrowheadPatch(untouched), untouched);
});

test("swap flips the ends and normalizes legacy dot", () => {
  assert.deepEqual(swapArrowheadsPatch("arrow", "dot"), { startArrowhead: "circle", endArrowhead: "arrow" });
  assert.deepEqual(swapArrowheadsPatch(null, "bar"), { startArrowhead: "bar", endArrowhead: null });
});
