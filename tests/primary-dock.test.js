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

test("expanded tool dock is a vertical left-edge rail above the bottom trigger", () => {
 const hud = readFileSync(new URL("../src/styles/hud-capsules.css", import.meta.url), "utf8");
 assert.match(hud, /left:calc\\(16px/);
 assert.match(hud, /bottom:calc\\(16px/);
 assert.match(hud, /flex-direction:column !important;[\\s\\S]*?width:44px !important/);
 assert.match(hud, /bottom:calc\\(100% \\+ 8px\\) !important/);
 assert.match(hud, /overflow-y:auto !important/);
 assert.match(hud, /background:rgba\\(238,242,255,.8\\) !important/);
 assert.match(hud, /border-color:#a5b4fc !important/);
 assert.match(hud, /color:#4f46e5 !important/);
 assert.doesNotMatch(hud, /flex-direction:row;[\\s\\S]*?width:max-content/);
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

test("collapsed trigger retains the 40px icon-and-chevron pill", () => {
 const hud = readFileSync(new URL("../src/styles/hud-capsules.css", import.meta.url), "utf8");
 assert.match(dock, /<ToolIcon name=\\{activeToolMeta\\.id\\} size=\\{22\\} strokeWidth=\\{1\\.75\\} \\/>/);
 assert.match(hud, /width:70px !important;[\\s\\S]*?height:40px !important/);
 assert.match(hud, /gap:10px !important;[\\s\\S]*?padding:0 12px !important/);
 assert.match(hud, /flex:0 0 22px; width:22px; height:22px/);
 assert.match(hud, /flex:0 0 12px; width:12px; height:12px/);
});


