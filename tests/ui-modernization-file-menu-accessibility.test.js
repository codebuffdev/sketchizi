import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("recent-item changes have a polite atomic live announcement region", () => {
  assert.match(menu, /data-file-menu-announcement role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(menu, /announceFileMenuStatus\(item \? `Removed \$\{item\.name\} from Recent files\.`/);
  assert.match(menu, /announceFileMenuStatus\(item \? `Removed \$\{item\.name\} from Recent folders\.`/);
});

test("clearing recent lists announces useful counts and empty-list feedback", () => {
  assert.match(menu, /Cleared \$\{count\} \$\{count === 1 \? "file" : "files"\} from Recent files/);
  assert.match(menu, /Cleared \$\{count\} \$\{count === 1 \? "folder" : "folders"\} from Recent folders/);
  assert.match(menu, /Recent files is already empty/);
  assert.match(menu, /Recent folders is already empty/);
});

test("removing an item returns focus to a stable recent-list action", () => {
  assert.match(menu, /recentMenu\?\.querySelector\("\[data-clear-recent-files\]"\)\?\.focus\(\)/);
  assert.match(menu, /recentMenu\?\.querySelector\("\[data-clear-recent-folders\]"\)\?\.focus\(\)/);
});

test("empty-state copy wraps and recent disclosures expose a touch affordance", () => {
  assert.match(styles, /\.sketchizi-recent-empty[\s\S]*overflow-wrap: anywhere/);
  assert.match(styles, /\.sketchizi-recent-dropdown > summary[\s\S]*cursor: pointer/);
});

test("accessibility regression test is included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-accessibility\.test\.js/);
});
