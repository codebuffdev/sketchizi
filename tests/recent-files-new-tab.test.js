import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Recent files open in a new editor tab, focusing an already-open tab instead of duplicating", async () => {
  const files = await read("src/features/files/useFileManager.js");
  const tabs = await read("src/hooks/useWorkspaceTabs.js");
  const app = await read("src/App.jsx");
  const open = files.slice(files.indexOf("const openRecentFile = async"));
  // Menu closes first, then an existing tab is focused before anything is read or loaded.
  assert.ok(open.indexOf("closeNativeMenu()") < open.indexOf("focusExisting"));
  assert.match(open, /tabs\?\.focusExisting\?\.\(id\)\) return;/);
  // A new tab replaces the "replace current canvas" confirmation.
  assert.match(open, /tabs\.create/);
  assert.match(open, /recentId: id/);
  // The tab layer provides both actions and is wired through App.
  assert.match(tabs, /focusExisting: \(recentId\)/);
  assert.match(tabs, /createCanvasTab\(\{ name: label \|\| undefined \}\)/);
  assert.match(tabs, /file\.id === recentId \|\| file\.recentId === recentId/);
  assert.match(app, /recentFileTabsRef/);
});
