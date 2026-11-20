import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("both the live pen preview and committed stroke use the resolved appState width", () => {
  const engine = readFileSync(new URL("../src/features/canvas/freeDrawEngine.js", import.meta.url), "utf8");
  assert.equal((engine.match(/getAdjustedFreeDrawStrokeWidth\(appState\)/g) || []).length, 2);
  assert.match(engine, /getFreeDrawStrokeWidthKey\(appState\)/);
});
