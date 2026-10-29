import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../src/components/app/MoreTools.jsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/features/navigation/useMoreTools.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("dock starts locked and exposes a Tools-menu lock toggle", () => {
  assert.match(canvas, /container\.dataset\.sketchiziDockLocked = "true"/);
  assert.match(menu, /\["dock-lock", dockLocked \? "Unlock dock" : "Lock dock", ""\]/);
  assert.match(actions, /if \(tool === "dock-lock"\)[\s\S]*sketchizi:toggle-dock-lock/);
});

test("dragging by pointer or keyboard is disabled until the dock is unlocked", () => {
  assert.match(canvas, /if \(!dock \|\| dock\.dataset\.sketchiziDockLocked !== "false"\) return/);
  assert.match(canvas, /if \(container\.dataset\.sketchiziDockLocked !== "false" \|\| event\.button !== 0/);
  assert.match(styles, /App-toolbar-container\[data-sketchizi-dock-locked="true"\] \.sketchizi-dock-grip/);
  assert.match(styles, /data-sketchizi-dock-locked="true"\] \.App-toolbar \.sketchizi-dock-grip \{\s*display: none !important/);
  assert.match(styles, /data-sketchizi-dock-locked="false"\] \.App-toolbar \.sketchizi-dock-grip \{\s*display: inline-flex !important/);
});

test("lock state is communicated to the Tools menu", () => {
  assert.match(canvas, /sketchizi:dock-lock-state/);
  assert.match(menu, /addEventListener\("sketchizi:dock-lock-state"/);
});
