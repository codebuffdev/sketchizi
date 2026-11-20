import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCanvasTabId } from "../src/features/workspace/tabSnapshot.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("issue 5: tab ids created in the same millisecond are unique", () => {
  const ids = [];
  for (let i = 0; i < 5; i += 1) ids.push(createCanvasTabId(ids, 1700000000000));
  assert.equal(new Set(ids).size, 5);
  assert.equal(ids[0], "canvas-1700000000000");
  assert.equal(ids[1], "canvas-1700000000000-2");
  assert.ok(ids.every((id) => id.startsWith("canvas-")));
  assert.equal(createCanvasTabId(["canvas-1"], 2), "canvas-2");
});

test("issue 5: createCanvasTab no longer derives ids from Date.now() alone", () => {
  assert.doesNotMatch(app, /const id = `canvas-\$\{Date\.now\(\)\}`/);
  assert.match(app, /const id = createCanvasTabId\(currentTabs\.map\(\(tab\) => tab\.id\)\);/);
});

test("issue 5: Ctrl+N ignores auto-repeat keydowns", () => {
  const handler = app.slice(app.indexOf("const createCanvasFromShortcut"), app.indexOf("const createCanvasFromShortcut") + 900);
  assert.match(handler, /if \(event\.repeat\) return;\s*createCanvasTab\(\);/);
  // The key combination is still swallowed so the browser does not open a window on repeats.
  assert.ok(handler.indexOf("event.preventDefault()") < handler.indexOf("event.repeat"));
});

test("issue 5: closing the active tab persists the manifest that switchCanvasTab produced", () => {
  const close = app.slice(app.indexOf("const performCloseCanvasTab"), app.indexOf("const performCloseCanvasTab") + 2600);
  assert.match(close, /persistCanvasTabs\(isActive \? canvasTabsRef\.current\.filter\(\(item\) => item\.id !== tabId\) : remainingTabs\)/);
  assert.doesNotMatch(close, /switchCanvasTab\(nextActive\.id\);\s*\}\s*persistCanvasTabs\(remainingTabs\);/);
});
