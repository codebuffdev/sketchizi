import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("file menu is viewport constrained and scrolls without horizontal overflow", () => {
  assert.match(styles, /max-height: min\(76vh, 680px\)/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /overscroll-behavior: contain/);
});

test("file menu controls have comfortable target heights and narrow-screen action layout", () => {
  assert.match(styles, /min-height: 40px/);
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("long file and folder metadata can wrap without changing workflow selectors", () => {
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /flex-wrap: wrap/);
  for (const selector of ["data-sketchizi-open-folder", "data-sketchizi-new-file", "data-recent-id", "data-recent-folder-id", "data-clear-recent-files", "data-clear-recent-folders"]) {
    assert.ok(menu.includes(selector), `expected preserved selector ${selector}`);
  }
});

test("phase 26 responsive menu tests are part of the modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-responsive\.test\.js/);
});
