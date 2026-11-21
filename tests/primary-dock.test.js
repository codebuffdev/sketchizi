import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock renders the complete tool set in a compact hover sidebar", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(dock.includes('id: "' + tool + '"'), "missing sidebar tool: " + tool);
  }
  assert.match(dock, /sketchizi-tool-sidebar/);
  assert.match(dock, /separated: true/);
  assert.match(dock, /setActiveTool/);
  assert.match(dock, /onMouseEnter=\{expandDock\}/);
  assert.match(dock, /onMouseLeave=\{scheduleCollapse\}/);
  assert.doesNotMatch(dock, /sketchizi-radial-wheel|Move tool wheel|onPointerMove|setPointerCapture|tuckedOffset/);
});

test("sidebar stays bottom-left, expands upward and scrolls within the viewport", () => {
  const rail = sidebarCss.match(/\.sketchizi-tool-sidebar\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rail, /position:\s*fixed/);
  assert.match(rail, /left:\s*16px/);
  assert.match(rail, /bottom:\s*58px/);
  assert.match(rail, /max-height:\s*calc\(100dvh - 112px\)/);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-expanded \.sketchizi-tool-sidebar-list/);
  assert.match(sidebarCss, /overflow-y:\s*auto/);
  assert.match(sidebarCss, /backdrop-filter:\s*blur/);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar-button\.is-active/);
});

test("sidebar hides while the hamburger menu is open to prevent overlap", () => {
  const mount = canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "";
  assert.match(mount, /rootRef=\{canvasRootRef\}/);
  assert.match(mount, /apiRef=\{apiRef\}/);
  assert.match(mount, /nativeMenuOpen=\{nativeMenuOpen\}/);
  assert.match(dock, /nativeMenuOpen \? " is-menu-open" : ""/);
  assert.match(dock, /aria-hidden=\{nativeMenuOpen\}/);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar\.is-menu-open/);
  assert.match(sidebarCss, /pointer-events: none/);
});
