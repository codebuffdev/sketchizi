import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
const engine = readFileSync(new URL("../src/features/canvas/smartInkRecognition.js", import.meta.url), "utf8");
test("Write mode detects newly drawn strokes after a pause", () => {
  assert.match(picker, /baseline: new Set/);
  assert.match(picker, /el\.type === "freedraw"/);
  assert.match(picker, /supportsOnlineInk/);
  assert.match(picker, /void openPreview\(strokes\)/);
  assert.match(picker, /window\.clearInterval\(interval\)/);
});
test("OCR failure does not require manual transcription", () => {
  assert.match(engine, /VITE_SMART_INK_RECOGNITION_URL/);
  assert.match(engine, /controller\.abort\(\)/);
  assert.match(picker, /no retyping required/);
  assert.doesNotMatch(picker, /Keep original/);
});
