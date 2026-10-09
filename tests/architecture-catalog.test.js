import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/features/icon-library/useIconCatalog.js", import.meta.url), "utf8");

test("top-level Icon Library categories follow the approved order", () => {
  const navStart = panel.indexOf("quick-categories");
  const nav = panel.slice(navStart, panel.indexOf("</nav>", navStart));
  const positions = [
    nav.indexOf('"Eraser Icons"'),
    nav.indexOf('"Mind Maps"'),
    nav.indexOf('"AWS Architecture"'),
    nav.indexOf('"Kubernetes"'),
    nav.indexOf("\n            Architecture\n"),
    nav.indexOf('"Favorites"'),
    nav.indexOf('"Recently Used"'),
  ];
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("Architecture is a toggle with only implemented UML and Networking children", () => {
  assert.match(panel, /aria-expanded=\{architectureExpanded\}/);
  assert.match(panel, /onClick=\{\(\) => setArchitectureExpanded\(\(expanded\) => !expanded\)\}/);
  assert.match(panel, /\["UML Diagrams", umlIcons\.length/);
  assert.match(panel, /\["Networking", networkingIcons\.length/);
  for (const future of ["Security & Identity", "Compute & Runtime", "Data & Storage", "Messaging & Events", "Observability", "CI/CD & DevOps", "AI & Machine Learning", "Hybrid Cloud & Edge"]) {
    assert.equal(panel.includes(`"${future}"`), false, `${future} must not be a visible placeholder`);
  }
});

test("existing UML and Networking catalog selection paths remain intact", () => {
  assert.match(catalog, /activeCategory === "UML Diagrams"[\s\S]*?base = umlIcons/);
  assert.match(catalog, /activeCategory === "Networking"[\s\S]*?base = networkingIcons/);
  assert.match(panel, /onClick=\{\(\) => selectCategory\(category\)\}/);
});
