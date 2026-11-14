import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/features/canvas/smartInkRecognition.js", import.meta.url), "utf8");
const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
test("recognition has server and browser fallbacks", () => {
  assert.match(source, /globalThis\.TextDetector/);
  assert.match(source, /renderInkForRecognition/);
  assert.match(source, /VITE_SMART_INK_RECOGNITION_URL/);
});
test("successful recognition converts automatically; failures retain ink", () => {
  assert.match(picker, /beautifyInk\(api, selected, result\.text\)/);
  assert.match(picker, /item\.version === el\.version/);
  assert.match(picker, /Original ink preserved/);
  assert.doesNotMatch(picker, /<textarea/);
  assert.match(source, /convertToExcalidrawElements/);
});
