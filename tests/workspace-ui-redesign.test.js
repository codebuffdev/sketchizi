import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [tabs, header, theme, dock, styles, imports] = await Promise.all([
  read("../src/components/app/CanvasTabs.jsx"),
  read("../src/components/app/DesktopAppHeader.jsx"),
  read("../src/ThemeControl.jsx"),
  read("../src/components/app/PrimaryDock.jsx"),
  read("../src/styles/workspace-ui-redesign.css"),
  read("../src/styles.css"),
]);

test("document tabs use one 36px capsule for the active tab and its controls", () => {
  assert.match(tabs, /canvas-tab-item\$\{activeId === tab\.id \? " is-active" : ""\}/);
  assert.match(tabs, /canvas-tab-inline-rename/);
  assert.match(tabs, /canvas-tab-menu-trigger/);
  assert.match(styles, /\.canvas-tab-item\.is-active[\s\S]*?height:\s*36px/);
  assert.match(styles, /border-radius:\s*10px/);
  assert.match(styles, /background:\s*#232938/);
  assert.match(styles, /color:\s*#e8ecf4/);
  assert.match(styles, /color:\s*#818cf8/);
  assert.match(styles, /opacity:\s*\.55/);
  assert.match(styles, /canvas-tab-close::before/);
});

test("utility controls are ordered zoom, theme, AI, settings in a 34px row", () => {
  const zoom = header.indexOf("<CanvasZoomControl");
  const themeControl = header.indexOf("desktop-app-global-theme-control");
  const ai = header.indexOf("desktop-app-global-ai-control");
  const settings = header.indexOf("desktop-app-settings-wrap");
  assert.ok(zoom >= 0 && zoom < themeControl && themeControl < ai && ai < settings);
  assert.match(styles, /top:\s*12px\s*!important/);
  assert.match(styles, /right:\s*var\(--header-rail-right,\s*12px\)\s*!important/);
  assert.match(styles, /gap:\s*8px\s*!important/);
  assert.match(styles, /height:\s*34px\s*!important/);
  assert.equal((header.match(/desktop-app-settings-row/g) || []).length, 2);
  assert.match(theme, /setThemeMode\(isDarkTheme \? "light" : "dark"\)/);
});

test("primary dock has the requested 3-second hover delay and immediate outside/selection collapse", () => {
  assert.match(dock, /COLLAPSE_GRACE_MS = 3000/);
  assert.match(dock, /document\.addEventListener\("pointerdown", collapseOutside, true\)/);
  assert.match(dock, /onToolShortcut/);
  assert.match(dock, /collapseDock\(\)/);
  assert.match(dock, /sketchizi-tool-sidebar-tooltip/);
  assert.doesNotMatch(dock, /sketchizi-tool-sidebar-key/);
  assert.match(styles, /left:\s*12px/);
  assert.match(styles, /bottom:\s*12px/);
  assert.match(styles, /width:\s*46px/);
  assert.match(styles, /width:\s*36px/);
  assert.match(styles, /cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(styles, /left:\s*calc\(100% \+ 10px\)/);
});

test("dock groups navigation, shapes, creation, and utilities while preserving selection sync", () => {
  assert.match(dock, /group: "navigation"/);
  assert.match(dock, /group: "shapes"/);
  assert.match(dock, /group: "creation"/);
  assert.match(dock, /group: "utilities"/);
  assert.match(dock, /selectionToolByElementType/);
  assert.match(dock, /activeTool !== "selection"/);
  assert.match(dock, /selectedType/);
  assert.match(imports, /workspace-ui-redesign\.css/);
});
