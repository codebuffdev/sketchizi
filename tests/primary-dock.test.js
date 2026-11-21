import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock keeps every existing tool in an expandable bottom-left dock", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing dock tool: ${tool}`);
  }
  assert.match(dock, /sketchizi-tool-sidebar-collapsed-button/);
  assert.match(dock, /sketchizi-tool-sidebar-expanded-list/);
  assert.match(dock, /is-expanded/);
  assert.match(dock, /is-collapsed/);
  assert.match(dock, /setExpanded\(true\)/);
  assert.match(dock, /setExpanded\(false\)/);
  assert.match(dock, /separated: true/);
  assert.match(dock, /setActiveTool/);
});

test("dock is bottom-left, compact when collapsed, and scrollable when expanded", () => {
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-collapsed\s*\{[^}]*width:\s*48px/s);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-collapsed\s*\{[^}]*height:\s*54px/s);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar-expanded-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\s*\{[^}]*bottom:\s*12px\s*!important/s);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-expanded\s+\.sketchizi-tool-sidebar-button\.is-active/);
});

test("tool actions remain connected and selection immediately collapses the dock", () => {
  assert.match(dock, /activateTool\(\{ id: tool\.id, root: rootRef\.current, apiRef, onOpenTodoTab \}\)/);
  assert.match(dock, /setExpanded\(false\)/);
  assert.match(dock, /closeOnOutside/);
  assert.match(dock, /closeOnEscape/);
});

test("dock hides while the hamburger menu is open to prevent overlap", () => {
  const mount = canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "";
  assert.match(mount, /rootRef=\{canvasRootRef\}/);
  assert.match(mount, /apiRef=\{apiRef\}/);
  assert.match(mount, /nativeMenuOpen=\{nativeMenuOpen\}/);
  assert.match(dock, /nativeMenuOpen \? " is-menu-open" : ""/);
  assert.match(dock, /aria-hidden=\{nativeMenuOpen\}/);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-menu-open/);
  assert.match(sidebarCss, /pointer-events: none/);
});
