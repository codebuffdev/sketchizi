import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Icon Library exposes all 16 System Design primitives in tabs and category", () => {
  const panel = read("IconLibraryPanel.jsx");
  const primitives = read("features/system-design/primitives.js");
  assert.match(panel, /System Design \(16\)/);
  assert.match(panel, /source === "system-design" \? <PrimitiveIcon/);
  assert.match(panel, /searchAliases/);
  assert.match(primitives, /export const PRIMITIVES = Object\.freeze\(\[/);
  assert.equal((primitives.match(/p\(\{ kind:/g) || []).length, 16);
});

test("System Design icon click and drag create live nodes and record Recent usage", () => {
  const insertion = read("features/icon-library/useIconInsertion.js");
  assert.match(insertion, /icon\?\.source === "system-design"/);
  assert.match(insertion, /workspace\.actions\.addNode\(icon\.kind/);
  assert.match(insertion, /markRecentlyUsed\?\.\(icon\)/);
  assert.match(insertion, /insertIcon\(current\.icon, finishEvent\.clientX/);
  assert.match(insertion, /insertIcon\(icon, event\.clientX, event\.clientY\)/);
});

test("+ More opens the shared Icon Library instead of a duplicate popover", () => {
  const dock = read("features/system-design/CollapsibleQuickDock.jsx");
  const studio = read("features/system-design/SystemDesignStudio.jsx");
  assert.match(dock, /onClick=\{onOpenIconLibrary\}/);
  assert.doesNotMatch(dock, /morePrimitivesByCategory|sd-more-menu/);
  assert.match(studio, /onOpenIconLibrary=\{onOpenIconLibrary\}/);
});

test("standard Excalidraw contextual dock remains available outside System Design selections", () => {
  const studio = read("features/system-design/SystemDesignStudio.jsx");
  const css = read("features/system-design/systemDesign.css");
  assert.match(studio, /edge && isSystemDesignEdge\(selectedElement\)/);
  assert.match(css, /\.app \.sd-active\.sd-has-system-selection \.sketchizi-tool-options-dock/);
  assert.doesNotMatch(css, /\.app \.sd-active \.sketchizi-tool-options-dock/);
});
