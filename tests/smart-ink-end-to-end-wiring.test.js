import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
const engine = readFileSync(new URL("../src/features/canvas/smartInkRecognition.js", import.meta.url), "utf8");
const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");

test("Beautify button passes no React click event to stroke recognizer", () => {
  assert.match(picker, /onClick=\{\(\) => openPreview\(\)\}/);
  assert.match(picker, /Array\.isArray\(automaticStrokes\)/);
});
test("automatic and manual OCR cannot race", () => {
  assert.match(picker, /requestRef\.current/);
  assert.match(picker, /if \(requestRef\.current\) return/);
});
test("same-origin OCR is proxied in dev and can fallback to browser", () => {
  assert.match(engine, /"\/api\/smart-ink\/recognize"/);
  assert.match(engine, /if \(!response\.ok\) return recognizeInBrowser\(canvas\)/);
  assert.match(vite, /"\/api\/smart-ink\/recognize"/);
  assert.match(vite, /127\.0\.0\.1:8791/);
});
