import test from "node:test";
import { DOCK_SLOTS, ALL_CHILDREN } from "../src/components/app/primaryDockModel.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock renders the 9-slot tool set with Bucket Fill and Todo List", () => {
  assert.equal(DOCK_SLOTS.length, 9);
  const ids = ALL_CHILDREN.map((child) => child.id);
  for (const id of ["select", "lasso", "hand", "rectangle", "rounded-rectangle", "ellipse", "diamond", "triangle", "hexagon", "cylinder", "funnel", "arrow", "double-arrow", "curved-arrow", "elbow-arrow", "dashed-arrow", "line", "pen", "highlighter", "text", "sticky-note", "image", "frame", "eraser", "laser", "bucketfill", "todo"]) {
    assert.ok(ids.includes(id), "missing sidebar tool: " + id);
  }
  for (const removed of ["ai-assist", "embed", "library"]) assert.ok(!ids.includes(removed));
  assert.match(dock, /tool: child\.tool/);
  assert.ok(ids.includes("bucketfill"));
  assert.match(dock, /child\.action === "todo"/);
  assert.match(canvas, /onOpenTodoTab=\{onOpenTodoTab\}/);
  assert.match(dock, /sketchizi-tool-sidebar/);
  assert.match(dock, /setActiveTool/);
  assert.match(dock, /onMouseEnter=\{hoverExpand\}/);
  assert.match(dock, /className="sketchizi-tool-sidebar-active"[\s\S]*?onMouseEnter=\{hoverExpand\}/);
  assert.match(dock, /onMouseLeave=\{hoverCollapse\}/);
  assert.doesNotMatch(dock, /sketchizi-radial-wheel|Move tool wheel|setPointerCapture|tuckedOffset/);
});

test("sidebar stays a left-edge, vertically centred, scrollable floating rail", () => {
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

test("dock waits three seconds after pointer leaves and cancels collapse on re-entry", () => {
  assert.match(dock, /const COLLAPSE_GRACE_MS = 3000;/);
  assert.match(dock, /collapseTimerRef\.current = window\.setTimeout\([\s\S]*?\}, COLLAPSE_GRACE_MS\)/);
  assert.match(dock, /const expandDock = \(\) => \{[\s\S]*?cancelCollapseTimer\(\)/);
});


test("selecting a tool collapses the dock immediately and clears the pending hover timer", () => {
  assert.match(dock, /const collapseDock = useCallback\(\(returnFocus = true\) => \{\s*cancelCollapseTimer\(\);[\s\S]*?setExpanded\(false\)/);
  assert.match(dock, /const chooseChild = \(child, \{ keepOpen = false \} = \{\}\) => \{[\s\S]*?if \(!keepOpen\) collapseDock\(\);/);
});

test("changing the active tool (e.g. via keyboard shortcut) collapses the dock without stealing focus, except while a touch-pinned rail is open", () => {
  assert.match(dock, /if \(previousActiveIdRef\.current === activeId\) return;\s*previousActiveIdRef\.current = activeId;\s*if \(pinnedRef\.current\) return;[\s\S]*?setExpanded\(false\);\s*\}, \[activeId, closeRail\]\)/);
});
