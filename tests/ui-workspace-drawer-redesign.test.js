import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const menu = read("../src/features/navigation/useNativeSketchiziMenu.js");
const app = read("../src/App.jsx");
const shellCss = read("../src/styles/header-redesign.css");
const menuCss = read("../src/styles/responsive-menu.css");
const template = menu.slice(menu.indexOf("recentSection.innerHTML = `"), menu.indexOf("customBlock.append(recentSection)"));
const community = menu.slice(menu.indexOf("communitySection.innerHTML = `"), menu.indexOf("communitySection.style"));
const scope = "html body .dropdown-menu.dropdown-menu:has([data-sketchizi-custom-menu-block])";
const rule = (css, selector) => {
  const at = css.indexOf(`${scope} ${selector} {`);
  assert.ok(at >= 0, `expected rule for ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};

test("drawer shell is 316px glass with 16px radius and dark/light tokens", () => {
  const shell = shellCss.slice(shellCss.indexOf("Workspace drawer v2"));
  assert.match(shell, /width: 316px !important/);
  assert.match(shell, /max-width: calc\(100vw - 24px\) !important/);
  assert.match(shell, /border-radius: 16px !important/);
  assert.match(shell, /--sk-bg: rgba\(25, 28, 36, 0\.96\)/);
  assert.match(shell, /--sk-shadow: 0 20px 48px rgba\(0, 0, 0, 0\.6\)/);
  assert.match(shell, /--sk-bg: rgba\(255, 255, 255, 0\.96\)/);
  assert.match(shell, /--sk-border: rgba\(15, 23, 42, 0\.1\)/);
  assert.match(shell, /margin: 0 14px !important/);
});

test("workspace renders Canvas, Pages, Cloud Files and Open File as a 2x2 tile grid with preserved hooks", () => {
  assert.match(template, /class="sketchizi-native-settings-title">Workspace/);
  assert.match(template, /class="sketchizi-drawer-tag">Sketchizi/);
  for (const hook of ['data-sketchizi-canvas-mode="infinite"', 'data-sketchizi-canvas-mode="pages"', "data-sketchizi-open-workspace", "data-sketchizi-open-file"]) {
    assert.ok(template.includes(hook), `missing ${hook}`);
  }
  for (const label of ["Canvas", "Pages", "Cloud Files", "Open File"]) assert.ok(template.includes(`>${label}</span>`), `missing ${label}`);
  assert.match(rule(menuCss, ".sketchizi-ws-tiles"), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 8px/);
  const tile = rule(menuCss, ".sketchizi-ws-tile");
  assert.match(tile, /padding: 10px 12px/);
  assert.match(tile, /border-radius: 12px !important/);
  assert.match(rule(menuCss, ".sketchizi-ws-tile-icon"), /width: 28px;[\s\S]*height: 28px;[\s\S]*border-radius: 8px/);
});

test("active tile uses the accent treatment and follows the canvas mode", () => {
  assert.match(shellCss, /--sk-active-bg: rgba\(99, 102, 241, 0\.15\)/);
  assert.match(shellCss, /--sk-active-bg: #eef2ff/);
  assert.match(shellCss, /--sk-active-border: rgba\(129, 140, 248, 0\.4\)/);
  assert.match(menuCss, /\.sketchizi-ws-tile\[data-active="true"\] \.sketchizi-ws-tile-icon \{[^}]*background: var\(--sk-accent\);[^}]*color: #fff/);
  assert.match(menu, /canvasMode = "infinite"/);
  assert.match(menu, /tile\.dataset\.sketchiziCanvasMode === canvasMode/);
  assert.match(app, /useNativeSketchiziMenu\(\{[^}]*canvasMode: canvasPageContext\.mode/);
});

test("Recent files and Local drafts have single-line headers and no boxed clear buttons", () => {
  assert.doesNotMatch(template, /Clear recent files|Delete all local drafts|Local drafts · recently closed/);
  assert.match(template, /sketchizi-sec-title">Recent files</);
  assert.match(template, /sketchizi-sec-title">Local drafts</);
  assert.match(template, /data-clear-recent-files hidden>Clear</);
  assert.match(template, /data-clear-closed-tabs hidden>Delete all</);
  assert.match(rule(menuCss, ".sketchizi-sec-toggle"), /white-space: nowrap/);
  assert.match(rule(menuCss, ".sketchizi-sec-title"), /white-space: nowrap/);
  assert.match(rule(menuCss, ".sketchizi-sec-action:hover"), /rgba\(244, 63, 94, 0\.1\)[\s\S]*#fb7185/);
});

test("clear actions are visible only when a list has items and counts are numeric pills", () => {
  assert.match(menu, /setHidden\(recentMenu\?\.querySelector\("\[data-clear-recent-files\]"\), recentFiles\.length === 0\)/);
  assert.match(menu, /setHidden\(recentMenu\?\.querySelector\("\[data-clear-closed-tabs\]"\), closedTabs\.length === 0\)/);
  assert.match(menu, /setText\(closedCount, closedTabs\.length\)/);
  assert.match(menuCss, /\.sketchizi-sec-count\[data-closed-tabs-count\]\[data-has-items="true"\]/);
});

test("empty lists render a dashed single-box hint and populated drafts offer one-click Reopen", () => {
  assert.match(menu, /sketchizi-recent-empty sketchizi-empty-hint/);
  const hint = rule(menuCss, ".sketchizi-empty-hint");
  assert.match(hint, /border: 1px dashed/);
  assert.match(hint, /border-radius: 12px/);
  assert.match(hint, /padding: 10px 12px/);
  assert.match(hint, /font-size: 11px/);
  assert.match(menu, /class="sketchizi-reopen-pill" data-closed-tab-id=/);
  assert.match(menu, /countLiveElements\(item\)/);
  assert.match(rule(menuCss, ".sketchizi-reopen-pill"), /background: #6366f1 !important/);
  assert.match(menu, /sketchizi-row-icon[\s\S]*sketchizi-recent-name[\s\S]*sketchizi-recent-activity/);
});

test("clear handlers read live lists instead of stale closures", () => {
  assert.match(menu, /menuDataRef\.current = \{ recentFiles, closedTabs \}/);
  assert.match(menu, /const count = menuDataRef\.current\.recentFiles\.length/);
  assert.match(menu, /const count = menuDataRef\.current\.closedTabs\.length/);
});

test("community links are compact cards with tinted badges and trailing glyphs", () => {
  assert.match(community, /Drop a Review/);
  assert.match(community, /Connect with Coder/);
  assert.match(community, /data-tone="amber"/);
  assert.match(community, /data-tone="indigo"/);
  assert.match(community, /›/);
  assert.match(community, /↗/);
  const card = rule(menuCss, ".sketchizi-community-card");
  assert.match(card, /padding: 8px 12px !important/);
  assert.match(card, /border-radius: 12px !important/);
  assert.match(rule(menuCss, ".sketchizi-community-cards"), /gap: 6px/);
  assert.match(rule(menuCss, ".sketchizi-community-card > .sketchizi-card-badge"), /width: 24px;[\s\S]*height: 24px/);
});

test("native utility rows never truncate labels and show shortcuts as kbd badges", () => {
  const label = rule(menuCss, ".dropdown-menu-item__text");
  assert.match(label, /white-space: nowrap !important/);
  assert.match(label, /flex-shrink: 0/);
  assert.match(label, /text-overflow: clip !important/);
  assert.match(rule(menuCss, ".dropdown-menu-item__icon"), /flex-shrink: 0/);
  const row = rule(menuCss, ".dropdown-menu-item");
  assert.match(row, /padding: 8px 10px !important/);
  assert.match(row, /border-radius: 10px !important/);
  const kbd = rule(menuCss, ".dropdown-menu-item__shortcut kbd");
  assert.match(kbd, /monospace/);
  assert.match(kbd, /font-size: 10px/);
  assert.match(kbd, /padding: 2px 6px/);
  assert.match(kbd, /border-radius: 6px/);
  assert.match(menu, /document\.createElement\("kbd"\)/);
  assert.match(menu, /label: "Reset Canvas"/);
  assert.doesNotMatch(menu, /label: "Export Image"/);
  assert.doesNotMatch(menu, /label: "Find on Canvas"/);
  assert.match(menu, /blockedMenuLabels = new Set/);
});

test("Reset Canvas has a destructive rose tint and the old reset label is still recognised by trim logic", () => {
  assert.match(shellCss, /--sk-rose: #f87171/);
  assert.match(menuCss, /data-sketchizi-util="reset"\][^{]*\{[^}]*color: var\(--sk-rose\) !important/);
  assert.match(menu, /reset \(the \)\?canvas/);
});

test("legacy accessibility, test and file-workflow contracts remain", () => {
  for (const hook of ["data-recent-list", "data-recent-id", "data-remove-recent-file", "data-closed-tabs-list", "data-remove-closed-tab", "data-file-menu-announcement", 'aria-controls="sketchizi-recent-files-panel"', 'aria-controls="sketchizi-closed-tabs-panel"']) {
    assert.ok(menu.includes(hook), `missing ${hook}`);
  }
  assert.match(menu, /aria-expanded="true"/);
  assert.match(menuCss, /prefers-reduced-motion: reduce/);
});
test("native image export and canvas find stay removed while Export Studio owns its shortcut", () => {
  const shortcut = read("../src/features/navigation/exportStudioShortcut.js");
  assert.match(menu, /blockedMenuLabels = new Set/);
  assert.match(menu, /if \\(key === "f"\\)/);
  assert.doesNotMatch(menu, /key === "e" && event\\.shiftKey/);
  assert.match(shortcut, /target\\.addEventListener\\("keydown", onKeyDown, true\\)/);
  assert.match(app, /registerExportStudioShortcut/);
});
