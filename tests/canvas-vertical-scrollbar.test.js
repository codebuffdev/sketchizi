import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/app/CanvasVerticalScrollbar.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/canvas-vertical-scrollbar.css", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const dockStyles = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("infinite canvas scrollbar is mounted and uses the Excalidraw camera", () => {
  assert.match(canvas, /<CanvasVerticalScrollbar apiRef=\{apiRef\}/);
  assert.match(component, /getAppState\?\.\(\)/);
  assert.match(component, /appState: \{ scrollY: -currentRef\.current \}/);
  assert.match(component, /getSceneElements\?\.\(\)/);
});

test("scrollbar provides edge reveal, track navigation, drag, steps, and percentage", () => {
  assert.match(component, /window\.innerWidth - event\.clientX <= 48/);
  assert.match(component, /onThumbPointerDown/);
  assert.match(component, /jumpTo\(event\.clientY\)/);
  assert.match(component, /Scroll canvas up/);
  assert.match(component, /Scroll canvas down/);
  assert.match(component, /\{percent\}%/);
  assert.match(component, /currentRef\.current \+= difference \* 0\.14/);
  assert.match(component, /requestAnimationFrame/);
});

test("scrollbar has adaptive day and dark glass styling without native scrollbars", () => {
  assert.match(styles, /rgba\(255, 255, 255, \.94\)/);
  assert.match(styles, /rgba\(24, 27, 32, \.92\)/);
  assert.match(styles, /right: 12px/);
  assert.match(styles, /height: 280px/);
  assert.match(styles, /translate3d\(12px, -50%, 0\)/);
  assert.doesNotMatch(styles, /scroll-behavior:\s*smooth/);
});

test("primary dock uses a centered glass capsule and clamps its child rail", () => {
  assert.match(dock, /CHILD_CLOSE_GRACE_MS = 160/);
  assert.match(dock, /window\.innerHeight - 16 - railHeight/);
  assert.match(dockStyles, /left: 24px !important/);
  assert.match(dockStyles, /top: 50% !important/);
  assert.match(dockStyles, /backdrop-filter: blur\(14px\)/);
  assert.match(dockStyles, /--arrow-offset/);
});
