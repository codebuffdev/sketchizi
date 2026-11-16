import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const indicator = await readFile(new URL("../src/components/app/TextSizeIndicator.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/alignment-guides.css", import.meta.url), "utf8");

test("SketchiziCanvas imports and renders TextSizeIndicator alongside canvas overlays", () => {
  assert.match(canvas, /import TextSizeIndicator from "\.\/TextSizeIndicator";/);
  assert.match(canvas, /<TextSizeIndicator[\s\S]*?selectedElements=\{selectedElements\}/);
});

test("TextSizeIndicator displays pixel font size beneath selected text elements", () => {
  assert.match(indicator, /el\.type === "text"/);
  assert.match(indicator, /fontSize: Math\.round\(fontSize\)/);
  assert.match(indicator, /className="sketchizi-text-size-indicator"/);
  assert.match(indicator, /\{ind\.fontSize\}px/);
});

test("TextSizeIndicator styles define small, non-blocking floating indicator", () => {
  assert.match(styles, /\.sketchizi-text-size-indicator/);
  assert.match(styles, /pointer-events:\s*none/);
  assert.match(styles, /transform:\s*translate\(-50%,\s*0\)/);
  assert.match(styles, /font-size:\s*10px/);
});
