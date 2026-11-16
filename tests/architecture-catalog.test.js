import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/features/icon-library/useIconCatalog.js", import.meta.url), "utf8");

test("unified Icon Library lists collections in a predictable order", () => {
  const sourceTabsStart = panel.indexOf("const sourceTabs = [");
  const sourceTabsEnd = panel.indexOf("];", sourceTabsStart);
  const sourceTabs = panel.slice(sourceTabsStart, sourceTabsEnd);
  const positions = [
    sourceTabs.indexOf('{ id: "aws", label: "AWS" }'),
    sourceTabs.indexOf('{ id: "networking", label: "Networking" }'),
    sourceTabs.indexOf('{ id: "kubernetes", label: "Kubernetes" }'),
    sourceTabs.indexOf('{ id: "mindmaps", label: "Mind Maps" }'),
    sourceTabs.indexOf('{ id: "uml", label: "UML" }'),
    sourceTabs.indexOf('{ id: "eraser", label: "Essentials" }'),
    sourceTabs.indexOf('{ id: "all", label: "All" }'),
  ];
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.doesNotMatch(panel, /library-collections-wrap|library-collections-menu|chooseCollection/);
  assert.match(panel, /sk-unified-category-select/);
  assert.match(panel, /sourceTabs\.filter/);
});

test("Networking remains a first-class icon source through the All dropdown", () => {
  assert.match(panel, /\{ id: "networking", label: "Networking" \}/);
  assert.match(panel, /else if \(source === "networking"\)[\s\S]*?setActiveCategory\("Networking"\)/);
  assert.match(panel, /\["aws", "kubernetes", "networking", "uml", "mindmaps"\]\.includes\(activeSource\)/);
  assert.match(catalog, /activeCategory === "Networking"[\s\S]*?base = networkingIcons/);
});

test("UML and Mind Maps remain available through the All dropdown and existing catalogs", () => {
  assert.match(panel, /else if \(source === "uml"\)[\s\S]*?setActiveCategory\("UML Diagrams"\)/);
  assert.match(panel, /else if \(source === "mindmaps"\)[\s\S]*?setActiveCategory\("Mind Maps"\)/);
  assert.match(catalog, /activeCategory === "UML Diagrams"[\s\S]*?base = umlIcons/);
  assert.match(catalog, /activeCategory === "Mind Maps"[\s\S]*?base = mindMapIcons/);
});

test("Icon Library removes the redundant Collections dropdown without placeholder catalogs", () => {
  assert.doesNotMatch(panel, /library-collections-wrap|library-collections-menu|chooseCollection|activeSource === "collections"/);
  assert.match(panel, /aria-label="Icon category"/);
  assert.match(panel, /getSubcategoryOptions/);
  for (const future of ["Security & Identity", "Compute & Runtime", "Data & Storage", "Messaging & Events", "Observability", "CI/CD & DevOps", "AI & Machine Learning", "Hybrid Cloud & Edge"]) {
    assert.equal(panel.includes(`"${future}"`), false, `${future} must not be a visible placeholder`);
  }
});

test("existing UML and Networking catalog selection paths remain intact", () => {
  assert.match(catalog, /activeCategory === "UML Diagrams"[\s\S]*?base = umlIcons/);
  assert.match(catalog, /activeCategory === "Networking"[\s\S]*?base = networkingIcons/);
  assert.match(panel, /setActiveCategory\("Networking"\)/);
});
