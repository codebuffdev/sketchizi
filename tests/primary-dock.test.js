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
  assert.ok(hud.includes("left:calc(16px"));
  assert.ok(hud.includes("bottom:calc(16px"));
  assert.ok(hud.includes("flex-direction:column !important;"));
  assert.ok(hud.includes("width:44px !important;"));
  assert.ok(hud.includes("bottom:calc(100% + 8px) !important;"));
  assert.ok(hud.includes("overflow-y:auto !important;"));
  assert.ok(hud.includes("background:rgba(238,242,255,.8) !important;"));
  assert.ok(hud.includes("border-color:#a5b4fc !important;"));
  assert.ok(hud.includes("color:#4f46e5 !important;"));
  assert.ok(!hud.includes("flex-direction:row;"));
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

test("collapsed trigger is a compact 32px icon-and-chevron pill", () => {
  const hud = readFileSync(new URL("../src/styles/hud-capsules.css", import.meta.url), "utf8");
  assert.ok(dock.includes('size={19} strokeWidth={1.85}'));
  assert.ok(dock.includes('width="10" height="10"') && dock.includes('strokeWidth="2.25"'));
  assert.ok(hud.includes("width:52px !important; height:32px !important;"));
  assert.ok(hud.includes("max-height:32px !important;"));
  assert.ok(hud.includes("gap:4px !important;"));
  assert.ok(hud.includes("padding:0 8px !important;"));
  assert.ok(hud.includes("border-radius:10px !important;"));
  assert.ok(hud.includes("flex:0 0 19px; width:19px; height:19px; color:#1e293b;"));
  assert.ok(hud.includes("flex:0 0 10px; width:10px; height:10px; color:#94a3b8; transform:translateY(3px);"));
  assert.ok(hud.includes("transform:translateY(2px);"));
});


