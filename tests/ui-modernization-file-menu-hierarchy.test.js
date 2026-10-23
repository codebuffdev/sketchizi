import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("file management menu separates workspace actions from quick access", () => {
  assert.match(menu, /class="sketchizi-native-settings-title">Workspace/);
  assert.match(menu, /class="sketchizi-file-menu-group" aria-label="Current folder"/);
  assert.match(menu, /class="sketchizi-file-menu-actions" role="group" aria-label="File actions"/);
  assert.match(menu, /class="sketchizi-file-menu-group sketchizi-file-menu-recents" aria-label="Recent items"/);
  assert.match(menu, /aria-controls="sketchizi-recent-files-panel"/);
  assert.match(menu, /aria-controls="sketchizi-recent-folders-panel"/);
});

test("phase 25 preserves recent-file, recent-folder, and folder refresh workflows", () => {
  for (const selector of [
    "data-sketchizi-open-folder", "data-sketchizi-new-file", "data-refresh-current-folder",
    "data-folder-refresh-status", "data-current-folder-files", "data-recent-id",
    "data-recent-folder-id", "data-clear-recent-files", "data-clear-recent-folders",
  ]) assert.ok(menu.includes(selector), `expected existing workflow selector ${selector}`);
  assert.match(menu, /Permission needed — reopen the folder to allow access/);
  assert.match(menu, /Folder unavailable — reopen the folder to reconnect/);
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
