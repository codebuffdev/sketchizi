import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getStrokeWidthKeyForWidth, strokeWidthAppStatePatch } from "../src/features/canvas/strokeWidthKey.js";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");

test("issue 7: dock widths map to the keys the free-draw engine reads", () => {
  assert.equal(getStrokeWidthKeyForWidth(1), "thin");
  assert.equal(getStrokeWidthKeyForWidth(2), "medium");
  assert.equal(getStrokeWidthKeyForWidth(4), "bold");
  assert.equal(getStrokeWidthKeyForWidth(8), "extraBold");
  assert.equal(getStrokeWidthKeyForWidth(3.2), "bold");
  assert.equal(getStrokeWidthKeyForWidth("abc"), undefined);
  assert.equal(getStrokeWidthKeyForWidth(0), undefined);
});

test("issue 7: the patch carries both the number and the key", () => {
  assert.deepEqual(strokeWidthAppStatePatch(4), { currentItemStrokeWidth: 4, currentItemStrokeWidthKey: "bold" });
  assert.deepEqual(strokeWidthAppStatePatch(NaN), { currentItemStrokeWidth: NaN });
});

test("issue 7: both writers use the patch instead of writing only the numeric width", () => {
  assert.match(dock, /strokeWidthAppStatePatch\(value\)/);
  assert.match(toolbar, /Object\.assign\(appStatePatch, strokeWidthAppStatePatch\(patch\.strokeWidth\)\)/);
  assert.doesNotMatch(toolbar, /appStatePatch\.currentItemStrokeWidth = patch\.strokeWidth/);
});
