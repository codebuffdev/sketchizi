import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/app/SmartInkModePicker.css", import.meta.url), "utf8");

test("Draw toolbar offers two accessible choices", () => {
  assert.match(picker, /Draw over canvas/);
  assert.match(picker, /<strong>Write<\/strong>/);
  assert.match(picker, /role="menu"/);
  assert.match(picker, /role="menuitemradio"/);
  assert.match(picker, /aria-checked=/);
  assert.match(picker, /isNativeDrawButton\(button\)/);
});

test("both modes preserve native Excalidraw ink and read-only safeguards", () => {
  assert.match(picker, /setActiveTool\?\.\(\{ type: "freedraw" \}\)/);
  assert.match(picker, /!canEdit \|\| viewModeEnabled/);
  assert.match(picker, /Smart conversion coming next/);
  assert.match(canvas, /<SmartInkModePicker/);
  assert.match(css, /z-index: 10050/);
});
