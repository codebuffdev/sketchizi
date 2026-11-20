import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const wheelCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock is a radial iPad-style wheel with the complete tool set", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing wheel tool: ${tool}`);
  }
  assert.match(dock, /sketchizi-radial-wheel/);
  assert.match(dock, /sketchizi-radial-wheel-hub/);
  assert.match(dock, /aria-label="Move tool wheel"/);
  assert.match(dock, /pointermove/);
  assert.match(dock, /setActiveTool/);
  assert.doesNotMatch(dock, /menuOpen|paletteOpen|focusedTool|selection-focus|dock-launcher/);
});

test("wheel starts tucked at bottom-left, expands, and supports reliable pointer dragging", () => {
  assert.match(dock, /left: expanded \? 16 : -tuckedOffset, bottom: 16/);
  assert.match(dock, /setExpanded\(\(value\) => !value\)/);
  assert.match(dock, /onPointerMove=\{moveDrag\}/);
  assert.match(dock, /setPointerCapture/);
  assert.match(dock, /dragRef\.current\.pointerId/);
  assert.match(wheelCss, /--wheel-size: 220px/);
  assert.match(wheelCss, /--wheel-tool-size: 34px/);
  assert.match(wheelCss, /touch-action: none/);
});

test("canvas mounts the wheel without hamburger/collapse or selected-only settings", () => {
  const mount = canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "";
  assert.match(mount, /rootRef=\{canvasRootRef\}/);
  assert.match(mount, /apiRef=\{apiRef\}/);
  assert.doesNotMatch(mount, /menuOpen|selectedElements/);
});
