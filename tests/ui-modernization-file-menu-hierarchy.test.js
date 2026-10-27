import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("file management menu keeps workspace actions compact and focused on files", () => {
  assert.match(menu, /class="sketchizi-native-settings-title">Workspace/);
  assert.doesNotMatch(menu, /aria-label="Current folder"/);
  assert.doesNotMatch(menu, /Recent folders|data-recent-folder-list|data-clear-recent-folders/);
  assert.match(menu, /data-sketchizi-new-file/);
  assert.match(menu, /class="sketchizi-file-menu-actions" role="group" aria-label="File actions"/);
  assert.match(menu, /class="sketchizi-file-menu-group sketchizi-file-menu-recents" aria-label="Recent items"/);
  assert.match(menu, /aria-controls="sketchizi-recent-files-panel"/);
});

test("Open file menu action uses a single file icon", () => {
  assert.match(menu, /sketchizi-native-open-file-icon/);
  assert.match(menu, /const existingFolderIcon = item\.querySelector\("svg, \.dropdown-menu-item-icon, \.context-menu-item-icon, \.menu-item-icon"\)/);
  assert.match(menu, /existingFolderIcon\.remove\(\)/);
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
