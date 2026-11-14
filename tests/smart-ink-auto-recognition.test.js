import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
const engine = readFileSync(new URL("../src/features/canvas/smartInkRecognition.js", import.meta.url), "utf8");

test("Write mode observes only new ink and waits for pause before offering preview", () => {
  assert.match(picker, /baseline: new Set/);
  assert.match(picker, /el\.type === "freedraw"/);
  assert.match(picker, /Date\.now\(\) - session\.changedAt > 1400/);
  assert.match(picker, /void openPreview\(strokes\)/);
  assert.match(picker, /window\.clearInterval\(interval\)/);
});
test("recognition service is optional and never silently discards original ink", () => {
  assert.match(engine, /VITE_SMART_INK_RECOGNITION_URL/);
  assert.match(engine, /Content-Type": "image\/png"/);
  assert.match(engine, /response\.ok/);
  assert.match(engine, /controller\.abort\(\)/);
  assert.match(engine, /globalThis\.TextDetector/);
  assert.match(picker, /Keep original/);
  assert.match(picker, /Apply handwriting/);
});
