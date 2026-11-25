import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock renders the complete tool set in a vertical left sidebar", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(dock.includes('id: "' + tool + '"'), "missing sidebar tool: " + tool);
  }
  assert.match(dock, /sketchizi-tool-sidebar/);
  assert.match(dock, /separated: true/);
  assert.match(dock, /setActiveTool/);
  assert.match(dock, /onMouseEnter=\{expandDock\}/);
  assert.match(dock, /className="sketchizi-tool-sidebar-active"[\s\S]*?onMouseEnter=\{expandDock\}/);
  assert.match(dock, /onMouseLeave=\{scheduleCollapse\}/);
  assert.doesNotMatch(dock, /sketchizi-radial-wheel|Move tool wheel|onPointerMove|setPointerCapture|tuckedOffset/);
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
  assert.match(dock, /const collapseDock = \(\) => \{[\s\S]*?cancelCollapseTimer\(\)[\s\S]*?setExpanded\(false\)/);
  assert.match(dock, /const chooseTool = \(tool\) => \{[\s\S]*?collapseDock\(\);/);
  assert.doesNotMatch(dock, /if \(window\.matchMedia\?\.\("\(hover: none\)"\)\.matches\) collapseDock\(\)/);
});

test("changing the active tool (e.g. via keyboard shortcut) collapses the dock without stealing focus", () => {
  assert.match(dock, /useEffect\(\(\) => \{\s*if \(previousActiveIdRef\.current === activeId\) return;[\s\S]*?setExpanded\(false\);\s*\}, \[activeId\]\)/);
});

test("collapsed trigger uses the 36px Option A icon-and-chevron pill", () => {
  const hud = readFileSync(new URL("../src/styles/hud-capsules.css", import.meta.url), "utf8");
  assert.match(dock, /<ToolIcon name=\{activeToolMeta\.id\} size=\{20\} strokeWidth=\{1\.75\} \/>/);
  assert.match(dock, /className="sketchizi-tool-sidebar-chevron"[\s\S]*?width="12" height="12"[\s\S]*?strokeWidth="2"[\s\S]*?<path d="m6 15 6-6 6 6"/);
  assert.match(hud, /width: 58px !important;[\s\S]*?height: 36px !important;/);
  assert.match(hud, /gap: 6px !important;[\s\S]*?padding: 0 10px !important;/);
  assert.match(hud, /border-radius: 12px;[\s\S]*?background: #ffffff !important;[\s\S]*?0 4px 12px -2px rgba\(15, 23, 42, 0\.06\)/);
  assert.match(hud, /border-color: #cbd5e1 !important/);
  assert.match(hud, /color: #94a3b8;[\s\S]*?color: #334155;[\s\S]*?translateY\(-1px\)/);
});
