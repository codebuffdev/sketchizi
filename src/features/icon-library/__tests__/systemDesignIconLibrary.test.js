import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("Icon Library exposes all 16 System Design primitives in tabs and category", () => {
  const panel = read("IconLibraryPanel.jsx");
  const primitives = read("features/system-design/primitives.js");
  assert.match(panel, /System Design \(16\)/);
  assert.ok(panel.includes('onClick={() => chooseSource("system-design")}'));
  assert.match(panel, /initialSource = "all"/);
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

test("top workspace bar opens System Design components and invokes auto-layout", () => {
  const top = read("features/system-design/TopWorkspaceBar.jsx");
  const studio = read("features/system-design/SystemDesignStudio.jsx");
  assert.match(top, /className="sd-components-trigger" onClick=\{onOpenIconLibrary\}/);
  assert.match(top, /className="sd-auto-layout-trigger" onClick=\{onAutoLayout\}/);
  assert.match(studio, /onOpenIconLibrary=\{onOpenIconLibrary\} onAutoLayout=\{actions\.autoLayout\}/);
  assert.doesNotMatch(studio, /CollapsibleQuickDock/);
});

test("native Excalidraw drawing and contextual docks are never hidden by System Design mode", () => {
  const studio = read("features/system-design/SystemDesignStudio.jsx");
  const css = read("features/system-design/systemDesign.css");
  assert.match(studio, /edge && isSystemDesignEdge\(selectedElement\)/);
  assert.doesNotMatch(studio, /sd-has-system-selection|CollapsibleQuickDock/);
  assert.doesNotMatch(css, /sketchizi-tool-options-dock|display:\s*none\s*!important/);
});
