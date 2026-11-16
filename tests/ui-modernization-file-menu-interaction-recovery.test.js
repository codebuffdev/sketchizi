import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-features.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("file-menu opening actions share one busy-state and recovery helper", () => {
  assert.match(menu, /const runFileMenuOperation = \(button, operation, label\)/);
  assert.match(menu, /button\.setAttribute\("aria-busy", "true"\)/);
  assert.match(menu, /button\.removeAttribute\("aria-busy"\)/);
  assert.match(menu, /delete button\.dataset\.opening/);
});

test("recent files, recent folders, and current-folder entries use shared recovery", () => {
  assert.match(menu, /runFileMenuOperation\(button, \(\) => fileActionsRef\.current\.openDrawingFromCurrentFolder/);
  assert.match(menu, /runFileMenuOperation\(button, \(\) => fileActionsRef\.current\.openRecentFile/);
  assert.match(menu, /runFileMenuOperation\(button, \(\) => fileActionsRef\.current\.openRecentFolder/);
});

test("opening progress and unexpected failures are announced without claiming success", () => {
  assert.match(menu, /announceFileMenuStatus\(`Opening \$\{label\}…`\)/);
  assert.match(menu, /Could not finish opening \$\{label\}\. Check the error message and try again\./);
  assert.match(menu, /Open request ended for \$\{label\}\./);
  assert.doesNotMatch(menu, /announceFileMenuStatus\(`Successfully opened/);
});

test("busy controls retain visible progress styling and test is part of the suite", () => {
  assert.match(styles, /\.sketchizi-recent-item\[aria-busy="true"\]/);
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-interaction-recovery\.test\.js/);
});


test("native picker cancellation is announced neutrally and is not overwritten by cleanup", () => {
  assert.match(menu, /error\?\.name === "AbortError" \|\| error\?\.kind === "cancelled"/);
  assert.match(menu, /Opening \$\{label\} was cancelled\./);
  assert.match(menu, /!announcement\.startsWith\(`Opening \$\{label\} was cancelled\.`\)/);
});

test("unexpected failures remain actionable while busy state always resets", () => {
  assert.match(menu, /Could not finish opening \$\{label\}\. Check the error message and try again\./);
  assert.match(menu, /button\.disabled = false;[\s\S]*?button\.removeAttribute\("aria-busy"\);[\s\S]*?delete button\.dataset\.opening/);
});
