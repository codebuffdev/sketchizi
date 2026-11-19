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
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "note", "image", "frame", "eraser", "laser", "bucketfill", "autoshape"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing primary dock tool: ${tool}`);
  }
  assert.match(dock, /function ToolIcon/);
  assert.match(dock, /label: "Sticky Note"/);
  assert.match(dock, /note: <><path/);
  assert.doesNotMatch(dock.match(/note: <><path[\\s\\S]*?<\\/>,/)?.[0] || "", /M7\\.5 8|M7\\.5 11\\.5|M7\\.5 15/);
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

test("Sticky Note uses Sketchizi placement instead of Excalidraw's unimplemented note tool", () => {
  assert.match(dock, /id === "note"/);
  assert.match(dock, /detail: \{ tool: id \}/);
  assert.doesNotMatch(dock, /setActiveTool\?\.\(\{ type: id \}\)[\s\S]{0,80}note/);
  assert.match(canvas, /Sticky Notes are regular Excalidraw rectangles/);
  assert.match(canvas, /type: "rectangle"/);
  assert.match(canvas, /customData: \{ isNote: true, stickyNoteGroup: groupId \}/);
  assert.match(canvas, /fold-diagonal/);
  assert.match(canvas, /writing-three/);
  assert.match(canvas, /backgroundColor: "#fff3a6"/);
  assert.match(canvas, /stickyNoteGroup/);
  assert.match(canvas, /addEventListener\("pointerdown", placeNote, true\)/);
});

test("hamburger menu collapses the primary dock into an active-tool launcher", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /<SketchiziCanvas[\s\S]*?nativeMenuOpen=\{nativeMenuOpen\}/);
  assert.match(canvas, /nativeMenuOpen = false/);
  assert.match(canvas, /<PrimaryDock[\s\S]*?menuOpen=\{nativeMenuOpen\}/);
  assert.match(dock, /if \(menuOpen\)/);
  assert.match(dock, /sketchizi-dock-launcher/);
  assert.match(dock, /sketchizi-dock-quick-palette/);
  assert.match(dock, /aria-expanded=\{paletteOpen\}/);
  assert.match(dockCss, /\.sketchizi-dock-launcher-wrap/);
  assert.match(dockCss, /\.sketchizi-dock-quick-palette-grid/);
});

test("contextual tools and the Tools menu integrate with the new primary dock", () => {
  assert.match(toolOptions, /\.sketchizi-primary-dock button/);
  assert.match(moreTools, /\.sketchizi-primary-dock/);
  assert.doesNotMatch(moreTools, /sketchizi:toggle-dock-lock|dock-lock/);
  assert.doesNotMatch(moreTools, /sketchizi-more-tools-hidden/);
  assert.match(stylesEntry, /ui-modernization-toolbar-dock\.css/);
});
