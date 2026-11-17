import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const menuTemplate = menu.slice(menu.indexOf("recentSection.innerHTML = `"), menu.indexOf("customBlock.append(recentSection)"));
const styles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("file management menu keeps workspace actions compact and focused on files", () => {
  assert.match(menu, /class="sketchizi-native-settings-title">Workspace/);
  assert.doesNotMatch(menuTemplate, /aria-label="Current folder"/);
  assert.doesNotMatch(menuTemplate, /Recent folders|data-recent-folder-list|data-clear-recent-folders/);
  assert.match(menuTemplate, /data-sketchizi-new-file/);
  assert.match(menuTemplate, /class="sketchizi-file-menu-actions" role="group" aria-label="File actions"/);
  assert.match(menuTemplate, /class="sketchizi-file-menu-group sketchizi-file-menu-recents" aria-label="Recent items"/);
  assert.match(menuTemplate, /aria-controls="sketchizi-recent-files-panel"/);
});

test("duplicate native Open file menu item is removed", () => {
  assert.match(menu, /The custom Workspace section already provides Open file/);
  assert.match(menu, /if \(item && item !== menu\) item\.remove\(\)/);
  assert.doesNotMatch(menu, /sketchizi-native-open-file-icon/);
});

test("file menu preserves new-file and recent-file workflows after removing folder browsing", () => {
  for (const selector of [
    "data-sketchizi-new-file", "data-recent-id", "data-clear-recent-files",
  ]) assert.ok(menu.includes(selector), `expected existing workflow selector ${selector}`);
});

test("file menu has keyboard focus, disabled-state, theme, and reduced-motion polish", () => {
  assert.match(styles, /\.sketchizi-file-menu-actions/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /button:disabled/);
  assert.match(styles, /data-sketchizi-theme="dark"/);
  assert.match(styles, /data-sketchizi-theme="light"/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("phase 25 menu tests are included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-hierarchy\.test\.js/);
});


test("hamburger catalog stays within the viewport and exposes a scrollbar", () => {
  assert.ok(styles.includes("max-height: calc(100vh - 24px) !important"));
  assert.ok(styles.includes("max-height: calc(100dvh - 24px) !important"));
  assert.match(styles, /overflow-y: auto !important/);
  assert.match(styles, /scrollbar-width: auto !important/);
  assert.match(styles, /::-webkit-scrollbar/);
});

test("workspace menu offers Open file and improved community action icons", () => {
  assert.match(menuTemplate, /data-sketchizi-open-file/);
  assert.match(menuTemplate, /data-sketchizi-new-file>New file<\/button>/);
  assert.match(menuTemplate, /data-sketchizi-open-file><span aria-hidden="true">↗<\/span> Open file<\/button>/);
  assert.doesNotMatch(menuTemplate, /data-sketchizi-new-file><span aria-hidden="true">▤<\/span>/);
  assert.doesNotMatch(menuTemplate, /data-sketchizi-open-file[^<]*<kbd>Ctrl\+O<\/kbd>/);
  assert.match(menu, /sketchizi-review-icon/);
  assert.match(menu, /sketchizi-git-icon/);
});
