import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("native file menu registers keyboard shortcuts and cleans up its global listeners", () => {
  assert.match(menu, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(menu, /document\.removeEventListener\("keydown", onKeyDown, true\)/);
  assert.match(menu, /key === "o" && !event\.shiftKey/);
  assert.match(menu, /fileActionsRef\.current\.openDrawingFromDisk\?\.\(\)/);
});

test("native file menu intercepts file actions and cleans up click listeners", () => {
  assert.match(menu, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(menu, /document\.removeEventListener\("click", onClick, true\)/);
  assert.match(menu, /data-sketchizi-open-file/);
  assert.match(menu, /event\.stopImmediatePropagation\?\.\(\)/);
});

test("file menu interaction regression test is included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-dialog-focus\.test\.js/);
});
