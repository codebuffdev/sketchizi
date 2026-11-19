import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../src/components/app/ExperimentalPrimaryDock.jsx", import.meta.url), "utf8");
const dockCss = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
const stylesEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("experimental dock is a separate React component and remains opt-in", () => {
  assert.match(canvas, /const \[dockPreviewEnabled, setDockPreviewEnabled\] = useState\(false\)/);
  assert.match(canvas, /import ExperimentalPrimaryDock from "\.\/ExperimentalPrimaryDock"/);
  assert.match(canvas, /<ExperimentalPrimaryDock[\s\S]*?apiRef=\{apiRef\}/);
  assert.match(canvas, /data-sketchizi-dock-preview=\{dockPreviewEnabled \? "true" : undefined\}/);
  assert.match(canvas, /Preview new dock/);
  assert.match(canvas, /Exit dock preview/);
  assert.doesNotMatch(dock, /App-toolbar/);
});

test("independent dock renders its own grouped tools and uses Excalidraw API actions", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "eraser"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing independent dock tool: ${tool}`);
  }
  assert.match(dock, /function ToolIcon/);
  assert.match(dock, /apiRef\.current\?\.setActiveTool/);
  assert.match(dock, /aria-pressed=\{selected\}/);
});

test("test mode hides the native dock and displays an independent floating panel", () => {
  assert.match(dockCss, /\.canvas\[data-sketchizi-dock-preview="true"\] \.excalidraw \.App-toolbar-container[\s\S]*?display: none !important/);
  assert.match(dockCss, /\.sketchizi-experimental-primary-dock[\s\S]*?position: fixed/);
  assert.match(dockCss, /width: 38px/);
  assert.match(dockCss, /border-radius: 14px/);
  assert.match(dockCss, /\.app\.theme-dark \.sketchizi-experimental-primary-dock/);
  assert.match(stylesEntry, /ui-modernization-toolbar-dock\.css/);
});
