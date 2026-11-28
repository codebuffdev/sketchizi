import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/app/CanvasScrollbars.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/canvas-scrollbars.css", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const dockStyles = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("infinite canvas scrollbars are mounted and drive the Excalidraw camera on both axes", () => {
  assert.match(canvas, /<CanvasScrollbars apiRef=\{apiRef\}/);
  assert.match(component, /getAppState\?\.\(\)/);
  assert.match(component, /getSceneElements\?\.\(\)/);
  assert.match(component, /scrollKey: "scrollY"/);
  assert.match(component, /scrollKey: "scrollX"/);
  assert.match(component, /\[cfg\.scrollKey\]: -value/);
});

test("scrollbars provide hover/wheel/drag reveal, track jump, thumb drag and eased wheel glide", () => {
  assert.match(component, /const WAKE_MS = 900/);
  assert.match(component, /onThumbPointerDown/);
  assert.match(component, /axis\.jumpTo\(/);
  assert.match(component, /currentRef\.current \+= difference \* LERP/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /clampScroll\(/);
  // The old chrome is gone: no arrow buttons, no percentage readout.
  assert.doesNotMatch(component, /Scroll canvas (up|down)|▲|▼|sketchizi-scroll-percent|\{percent\}%/);
});

test("scrollbars are invisible at rest, hover-revealed, slim pills with adaptive day/dark colours", () => {
  assert.match(styles, /right: 2px;[^}]*width: 22px/);
  assert.match(styles, /bottom: 2px;[^}]*height: 22px/);
  assert.match(styles, /\.sketchizi-scrollzone\.is-disabled \{ display: none; pointer-events: none; \}/);
  assert.match(styles, /opacity: 0;[\s\S]*?transition: opacity 200ms ease, width 140ms ease, height 140ms ease, background-color 140ms ease/);
  assert.match(styles, /\.sketchizi-scrollzone:hover > \.sketchizi-scroll-thumb[\s\S]*?opacity: 1/);
  assert.match(styles, /width: 5px/);
  assert.match(styles, /width: 8px/);
  assert.match(styles, /border-radius: 9999px/);
  assert.match(styles, /min-height: 36px/);
  for (const colour of ["rgba(100, 116, 139, 0.30)", "rgba(148, 163, 184, 0.28)", "rgba(79, 70, 229, 0.72)", "rgba(129, 140, 248, 0.78)"]) assert.ok(styles.includes(colour), colour);
  assert.doesNotMatch(styles, /scroll-behavior:\s*smooth|backdrop-filter|box-shadow:\s*0/);
});

test("primary dock uses a centered glass capsule and clamps its child rail", () => {
  assert.match(dock, /CHILD_CLOSE_GRACE_MS = 160/);
  assert.match(dock, /window\.innerHeight - 16 - railHeight/);
  assert.match(dockStyles, /left: 24px !important/);
  assert.match(dockStyles, /top: 50% !important/);
  assert.match(dockStyles, /backdrop-filter: blur\(14px\)/);
  assert.match(dockStyles, /--arrow-offset/);
});
