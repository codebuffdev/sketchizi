import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/app/SmartInkModePicker.css", import.meta.url), "utf8");

test("Draw toolbar offers Freehand and Write choices", () => {
  assert.match(picker, /<strong>Freehand<\/strong>/);
  assert.match(picker, /<strong>Write<\/strong>/);
  assert.match(picker, /role="menu"/);
  assert.match(picker, /role="menuitemradio"/);
  assert.match(picker, /aria-checked=/);
  assert.match(picker, /isNativeDrawButton\(button\)/);
});

test("both modes preserve native Excalidraw ink and read-only safeguards", () => {
  assert.match(picker, /setActiveTool\?\.\(\{ type: "freedraw" \}\)/);
  assert.match(picker, /!canEdit \|\| viewModeEnabled/);
  assert.match(picker, /Automatically beautify recognized handwriting/);
  assert.match(picker, /live ink cleanup/);
  assert.match(canvas, /<SmartInkModePicker/);
  assert.match(css, /z-index: 10050/);
});

test("picker anchors above dock without overlapping it", () => {
  assert.match(picker, /bottom: window\.innerHeight - rect\.top \+ 12/);
  assert.match(picker, /top: rect\.bottom \+ 12/);
  assert.doesNotMatch(picker, /rect\.top - 110/);
});
