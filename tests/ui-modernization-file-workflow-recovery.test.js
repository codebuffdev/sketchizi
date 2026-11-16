import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-features.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("recent file open actions become busy to prevent duplicate activation", () => {
  assert.match(menu, /runFileMenuOperation\(button, \(\) => fileActionsRef\.current\.openRecentFile/);
  assert.match(menu, /openRecentFile\?\.\(button\.dataset\.recentId\)/);
  assert.match(menu, /delete button\.dataset\.opening/);
});

test("recent folder open actions become busy and restore their state after completion", () => {
  assert.match(menu, /openRecentFolder\?\.\(button\.dataset\.recentFolderId\)/);
  assert.match(menu, /openDrawingFromCurrentFolder\?\.\(match\)/);
  assert.match(menu, /runFileMenuOperation\(button, \(\) => fileActionsRef\.current\.openRecentFolder/);
  assert.match(menu, /const runFileMenuOperation = \(button, operation, label\)/);
  assert.match(menu, /button\.removeAttribute\("aria-busy"\)/);
});

test("busy file actions have a visible progress affordance", () => {
  assert.match(styles, /\.sketchizi-recent-item\[aria-busy="true"\]/);
  assert.match(styles, /cursor: progress/);
});

test("workflow recovery regression test is included in UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-workflow-recovery\.test\.js/);
});
