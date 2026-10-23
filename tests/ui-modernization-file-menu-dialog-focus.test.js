import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("repository picker moves focus into the dialog when opened", () => {
  assert.match(menu, /const opener = document\.activeElement;[\s\S]*?document\.body\.append\(overlay\);/);
  assert.match(menu, /search\?\.focus\(\);/);
});

test("repository picker traps Tab navigation inside the modal", () => {
  assert.match(menu, /overlay\.addEventListener\("keydown", \(event\) => \{/);
  assert.match(menu, /if \(event\.key !== "Tab"\) return;/);
  assert.match(menu, /event\.shiftKey && \(document\.activeElement === first \|\| !overlay\.contains\(document\.activeElement\)\)/);
  assert.match(menu, /!event\.shiftKey && \(document\.activeElement === last \|\| !overlay\.contains\(document\.activeElement\)\)/);
});

test("Escape and close actions restore focus to the opener when it still exists", () => {
  assert.match(menu, /if \(event\.key === "Escape"\)[\s\S]*?close\(\);/);
  assert.match(menu, /if \(opener instanceof HTMLElement && opener\.isConnected && !opener\.disabled\) opener\.focus\(\);/);
  assert.match(menu, /if \(closed\) return;[\s\S]*?closed = true;[\s\S]*?overlay\.remove\(\);/);
});

test("dialog focus regression test is included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-menu-dialog-focus\.test\.js/);
});
