import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getActiveSelectedElementIds } from "../src/features/canvas/selectedElementIds.js";

const canvasTools = readFileSync(new URL("../src/features/canvas/useCanvasTools.js", import.meta.url), "utf8");
const scene = readFileSync(new URL("../src/features/canvas/useExcalidrawScene.js", import.meta.url), "utf8");
const guides = readFileSync(new URL("../src/components/app/AlignmentGuides.jsx", import.meta.url), "utf8");

test("selection excludes false or missing element IDs", () => {
  assert.deepEqual(getActiveSelectedElementIds(null), []);
  assert.deepEqual(getActiveSelectedElementIds(undefined), []);
  assert.deepEqual(getActiveSelectedElementIds({}), []);
  assert.deepEqual(getActiveSelectedElementIds({ a: true, b: false, c: true }), ["a", "c"]);
  assert.deepEqual(getActiveSelectedElementIds({ a: false }), []);
  assert.deepEqual(getActiveSelectedElementIds({ a: 0, b: null, c: "true" }), []);
});

test("scene selection and bulk formatting share the same active selection filter", () => {
  assert.match(canvasTools, /getActiveSelectedElementIds\(api\.getAppState\(\)\.selectedElementIds\)/);
  assert.match(scene, /getActiveSelectedElementIds\(appState\.selectedElementIds\)/);
  assert.doesNotMatch(scene, /Object\.keys\(appState\.selectedElementIds \|\| \{\}\)/);
  assert.doesNotMatch(canvasTools, /Object\.keys\(api\.getAppState\(\)\.selectedElementIds \|\| \{\}\)/);
});

test("smart guides support the first drag of an unselected shape", () => {
  assert.match(guides, /if \(appState\.activeTool\?\.type && appState\.activeTool\.type !== "selection"\) return/);
  assert.match(guides, /activePointerId = event\.pointerId/);
  assert.match(guides, /event\.pointerId !== activePointerId/);
  assert.match(guides, /event\.pointerId === activePointerId/);
  assert.doesNotMatch(guides, /if \(!selectedIds\.length\) return/);
  assert.match(guides, /const selectedIds = new Set\(Object\.entries\(appState\.selectedElementIds \|\| \{\}\)\.filter/);
});
