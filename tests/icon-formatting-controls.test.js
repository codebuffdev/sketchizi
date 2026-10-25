import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("library image selections do not expose unsupported color controls", async () => {
  const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
  assert.ok(toolbar.includes("const hasImageSelection = liveSelection.some"));
  assert.ok(toolbar.includes('aria-label="Text color"'));
  assert.ok(toolbar.includes('aria-label="Stroke color"'));
  assert.ok(toolbar.includes("{showFill && !hasImageSelection && ("));
  assert.ok(toolbar.includes("{showStrokeWidth && !hasImageSelection && ("));
});

test("normal text and native shape formatting remains enabled", async () => {
  const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
  assert.ok(toolbar.includes("applyToSelected({ strokeColor: color })"));
  assert.ok(toolbar.includes("applyToSelected({ backgroundColor: color })"));
  assert.ok(toolbar.includes("applyToSelected({ fontSize:"));
});

test("generic formatting never mutates library icon image assets", async () => {
  const source = await readFile(new URL("../src/features/canvas/useCanvasTools.js", import.meta.url), "utf8");
  assert.ok(source.includes('element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon)'));
  assert.ok(source.includes("return element;"), "library icon images are returned unchanged");
  assert.ok(!source.includes("recoloredFileIds"));
  assert.ok(!source.includes("recoloredFiles"));
  assert.ok(!source.includes("XMLSerializer"));
});
