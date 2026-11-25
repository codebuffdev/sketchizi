import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "../../App.jsx"), "utf8");
const menu = readFileSync(resolve(here, "../../features/navigation/useNativeSketchiziMenu.js"), "utf8");
const tabs = readFileSync(resolve(here, "../../hooks/useWorkspaceTabs.js"), "utf8");
const styles = readFileSync(resolve(here, "../../styles/responsive-menu.css"), "utf8");

test("Canvas action appends and activates a fresh canvas tab", () => {
  assert.match(menu, /data-sketchizi-canvas-mode/);
  assert.match(menu, /sketchizi:workspace-create-tab/);
  assert.match(app, /createWorkspaceTab[\s\S]*?createCanvasTab\(\{ \.\.\.\(nextName \? \{ name: nextName \} : \{\}\), type: mode === "pages" \? "pages" : "canvas" \}\)/);
  assert.match(tabs, /const nextTabs = \[\.\.\.currentTabs, nextTab\]/);
  assert.match(tabs, /persistCanvasTabs\(nextTabs\);[\s\S]*?switchCanvasTab\(id\)/);
  assert.match(tabs, /elements: \[\], appState:/);
});

test("Pages action seeds a typed Pages tab before switching the active tab", () => {
  assert.match(menu, /sketchizi:workspace-create-tab/);
  assert.match(app, /createCanvasTab\(\{ \.\.\.\(nextName \? \{ name: nextName \} : \{\}\), type: mode === "pages" \? "pages" : "canvas" \}\)/);
  assert.match(tabs, /const isPagesTab = requestedType === "pages"/);
  assert.match(tabs, /type: isPagesTab \? "pages" : requestedType/);
  assert.match(tabs, /createDefaultPagesSnapshot\(apiRef\.current\)/);
  assert.doesNotMatch(app, /requestAnimationFrame\(\(\) => \{[\s\S]*?choose-canvas-mode.*?pages/);
});

test("Cloud Files keeps the existing Cloud Workspace navigation flow", () => {
  assert.match(menu, /data-sketchizi-open-workspace/);
  assert.match(menu, /bind\(recentMenu\?\.querySelector\("\[data-sketchizi-open-workspace\]"\), "bound", openCloudWorkspace\)/);
  assert.doesNotMatch(menu, /sketchizi:workspace-open-cloud-file/);
});

test("Open File creates a tab before invoking the existing local file picker", () => {
  assert.match(menu, /sketchizi:workspace-open-local-file/);
  assert.match(app, /openLocalFileInNewTab[\s\S]*?createCanvasTab\(\)[\s\S]*?Promise\.resolve\(fileActionsRef\.current\.openDrawingFromDisk\?\.\(\)\)/);
  assert.ok(app.includes(String.raw`openedName.replace(/\.(sketchizi|excalidraw|json)$/i, "")`));
});

test("workspace tiles no longer expose an active purple mode state", () => {
  assert.match(menu, /setAttr\(tile, "data-active", "false"\)/);
  assert.match(menu, /data-tone="slate"/);
  assert.doesNotMatch(styles, /\.sketchizi-ws-tile\[data-active="true"\]/);
  assert.match(styles, /outline: 2px solid #059669/);
});
