import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const dockCss = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
const toolOptions = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const moreTools = readFileSync(new URL("../src/features/navigation/useMoreTools.js", import.meta.url), "utf8");
const stylesEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("standalone dock is the permanent primary dock, with no preview toggle", () => {
  assert.match(canvas, /import PrimaryDock from "\.\/PrimaryDock"/);
  assert.match(canvas, /<PrimaryDock[\s\S]*?apiRef=\{apiRef\}/);
  assert.doesNotMatch(canvas, /dockPreviewEnabled|Preview new dock|Exit dock preview|data-sketchizi-dock-preview/);
  assert.doesNotMatch(canvas, /Enhance Excalidraw's own toolbar in place/);
  assert.doesNotMatch(canvas, /toolbar\.dataset\.sketchiziDockPreview/);
  assert.match(dockCss, /\.app \.canvas \.excalidraw \.App-toolbar-container\s*\{\s*display: none !important;/);
  assert.doesNotMatch(dockCss, /data-sketchizi-dock-preview/);
  assert.doesNotMatch(dockCss, /sketchizi-dock-preview-toggle/);
});

test("independent dock contains the full drawing tool set without decorative controls", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing primary dock tool: ${tool}`);
  }
  assert.match(dock, /function ToolIcon/);
  assert.ok(dock.includes('.excalidraw [data-testid="toolbar-image"]'));
  assert.match(dock, /apiRef\.current\?\.setActiveTool/);
  assert.match(dock, /aria-pressed=\{selected\}/);
  assert.match(dock, /sketchizi:activate-tool/);
  assert.doesNotMatch(dock, /sketchizi:toggle-dock-lock|sketchizi:dock-lock-state|Lock dock|Unlock dock|primary-dock-grip|primary-dock-lock|shortcut/);
  assert.match(dockCss, /\.sketchizi-primary-dock[\s\S]*?position: fixed/);
  assert.match(dockCss, /width: 42px/);
  assert.match(dockCss, /width: 32px/);
  assert.match(dockCss, /\.sketchizi-primary-dock-tool > svg/);
  assert.match(dockCss, /border-radius: 16px/);
  assert.match(dockCss, /\.sketchizi-primary-dock\.is-dark/);
  assert.doesNotMatch(dock, /sketchizi-primary-dock-divider/);
  assert.doesNotMatch(dockCss, /sketchizi-primary-dock-divider/);
});

test("contextual tools and the Tools menu integrate with the new primary dock", () => {
  assert.match(toolOptions, /\.sketchizi-primary-dock button/);
  assert.match(moreTools, /\.sketchizi-primary-dock/);
  assert.doesNotMatch(moreTools, /sketchizi:toggle-dock-lock|dock-lock/);
  assert.doesNotMatch(moreTools, /sketchizi-more-tools-hidden/);
  assert.match(stylesEntry, /ui-modernization-toolbar-dock\.css/);
});
\n\ntest("primary dock supports bottom-edge auto-hide reveal", () => {\n assert.match(dock, /sketchizi-primary-dock-shell/);\n assert.match(dock, /sketchizi-primary-dock-reveal/);\n assert.match(dock, /setIsRevealed\\(false\\), 700/);\n assert.match(dockCss, /bottom: 10px/);\n assert.match(dockCss, /is-revealed \\.sketchizi-primary-dock/);\n});\n