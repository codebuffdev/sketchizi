import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary dock renders the complete tool set in a vertical left sidebar", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(dock.includes(`id: "${tool}"`), `missing sidebar tool: ${tool}`);
  }
  assert.match(dock, /sketchizi-tool-sidebar/);
  assert.match(dock, /flex-direction: column|separated: true/);
  assert.match(dock, /setActiveTool/);
  assert.doesNotMatch(dock, /sketchizi-radial-wheel|Move tool wheel|onPointerMove|setPointerCapture|expanded|tuckedOffset/);
});

test("sidebar matches the left-edge floating toolbar treatment", () => {
  assert.match(sidebarCss, /left: 26px/);
  assert.match(sidebarCss, /top: 50%/);
  assert.match(sidebarCss, /width: 56px/);
  assert.match(sidebarCss, /border-radius: 22px/);
  assert.match(sidebarCss, /\.sketchizi-tool-sidebar-button\.is-active/);
  assert.match(sidebarCss, /backdrop-filter: blur/);
  assert.match(sidebarCss, /overflow-y: auto/);
});

test("canvas mounts the sidebar without hamburger/collapse or selected-only settings", () => {
  const mount = canvas.match(/<PrimaryDock[\s\S]*?\/>/)?.[0] || "";
  assert.match(mount, /rootRef=\{canvasRootRef\}/);
  assert.match(mount, /apiRef=\{apiRef\}/);
  assert.doesNotMatch(mount, /menuOpen|selectedElements/);
});
