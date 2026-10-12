import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/features/icon-library/useIconCatalog.js", import.meta.url), "utf8");

test("redesigned Icon Library exposes source chips in the approved order", () => {
  const sourceTabsStart = panel.indexOf("const sourceTabs = [");
  const sourceTabsEnd = panel.indexOf("];", sourceTabsStart);
  const sourceTabs = panel.slice(sourceTabsStart, sourceTabsEnd);
  const positions = [
    sourceTabs.indexOf('{ id: "all", label: "All" }'),
    sourceTabs.indexOf('{ id: "eraser", label: "Eraser" }'),
    sourceTabs.indexOf('{ id: "aws", label: "AWS" }'),
    sourceTabs.indexOf('{ id: "kubernetes", label: "Kubernetes" }'),
  ];
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(panel, /library-source-chip.*Collections/);
});

test("Collections keeps implemented favorites, recently used, mind map, UML, and networking paths accessible", () => {
  assert.match(panel, /\["Favorites", `\$\{favorites\.length\} saved`\]/);
  assert.match(panel, /\["Recently Used", `\$\{recentIcons\.length\} icons`\]/);
  assert.match(panel, /\["Mind Maps", `\$\{mindMapIcons\.length\} elements`\]/);
  assert.match(panel, /\["UML Diagrams", `\$\{umlIcons\.length\} elements`\]/);
  assert.match(panel, /\["Networking", `\$\{networkingIcons\.length\} resources`\]/);
  for (const future of ["Security & Identity", "Compute & Runtime", "Data & Storage", "Messaging & Events", "Observability", "CI/CD & DevOps", "AI & Machine Learning", "Hybrid Cloud & Edge"]) {
    assert.equal(panel.includes(`"${future}"`), false, `${future} must not be a visible placeholder`);
  }
});

test("existing UML and Networking catalog selection paths remain intact", () => {
  assert.match(catalog, /activeCategory === "UML Diagrams"[\s\S]*?base = umlIcons/);
  assert.match(catalog, /activeCategory === "Networking"[\s\S]*?base = networkingIcons/);
  assert.match(panel, /const chooseCollection = \(category\) => \{[\s\S]*?setActiveCategory\(category\)/);
});
