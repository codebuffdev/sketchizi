import test from "node:test";
import assert from "node:assert/strict";
import { getFreeDrawStrokeWidthKey } from "../src/features/canvas/freeDrawStrokeWidth.js";

test("freedraw honors the current Excalidraw stroke width key", () => {
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidthKey: "thin" }), "thin");
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidthKey: "bold" }), "bold");
});

test("freedraw maps the legacy numeric dock width to the matching key", () => {
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidth: 1 }), "thin");
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidth: 2 }), "medium");
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidth: 4 }), "bold");
  assert.equal(getFreeDrawStrokeWidthKey({ currentItemStrokeWidth: 4, currentItemStrokeWidthKey: "medium" }), "bold");
  assert.equal(getFreeDrawStrokeWidthKey({}), "medium");
});
