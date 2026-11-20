import test from "node:test";
import assert from "node:assert/strict";
import { createCanvasTabId } from "../src/features/canvas/canvasTabIdentity.js";

test("canvas tab IDs remain unique when tabs are created in the same millisecond", () => {
  const first = createCanvasTabId([], 1234, () => 0.5);
  const second = createCanvasTabId([{ id: first }], 1234, () => 0.5);
  const third = createCanvasTabId([{ id: first }, { id: second }], 1234, () => 0.5);
  assert.equal(first, "canvas-1234");
  assert.notEqual(second, first);
  assert.notEqual(third, first);
  assert.notEqual(third, second);
});
