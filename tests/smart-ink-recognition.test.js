import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/features/canvas/smartInkRecognition.js", import.meta.url), "utf8");
const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");

test("recognition uses native browser detector with explicit fallback", () => {
  assert.match(source, /globalThis\.TextDetector/);
  assert.match(source, /available: false/);
  assert.match(source, /renderInkForRecognition/);
  assert.match(picker, /Browser recognition unavailable/);
});
test("conversion is gated on review and preserves original ink until apply", () => {
  assert.match(picker, /Review handwriting/);
  assert.match(picker, /Keep original/);
  assert.match(picker, /Apply handwriting/);
  assert.match(picker, /recognizedText\.trim\(\)/);
  assert.match(source, /convertToExcalidrawElements/);
  assert.match(source, /fontFamily: 1/);
  assert.match(source, /api\.updateScene/);
});
