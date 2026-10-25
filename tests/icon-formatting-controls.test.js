import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("library image selections do not expose unsupported color controls", async () => {
  const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
  assert.match(toolbar, /hasImageSelections*=s*liveSelection.some/);
  assert.match(toolbar, /{onlyTextSelections*&&s*<div[^>]*aria-label="Text color"/);
  assert.match(toolbar, /{!hasImageSelections*&&s*!onlyTextSelections*&&s*<div[^>]*aria-label="Stroke color"/);
  assert.match(toolbar, /{showFills*&&s*!hasImageSelections*&&/);
  assert.match(toolbar, /{showStrokeWidths*&&s*!hasImageSelections*&&/);
});

test("normal text and native shape formatting remains enabled", async () => {
  const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
  assert.match(toolbar, /onClick={() => applyToSelected({ strokeColor: color })}/);
  assert.match(toolbar, /onClick={() => applyToSelected({ backgroundColor: color })}/);
  assert.match(toolbar, /onClick={() => applyToSelected({ fontSize:/);
});

test("generic formatting never mutates library icon image assets", async () => {
  const source = await readFile(new URL("../src/features/canvas/useCanvasTools.js", import.meta.url), "utf8");
  assert.match(source, /element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon)/);
  assert.match(source, /if (element.type === "image" &&[sS]*?return element;/);
  assert.doesNotMatch(source, /recoloredFileIds|recoloredFiles|XMLSerializer/);
});
