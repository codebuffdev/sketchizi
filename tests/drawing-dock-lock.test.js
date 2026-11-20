import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const menu = await readFile(new URL("../src/components/app/MoreTools.jsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/features/navigation/useMoreTools.js", import.meta.url), "utf8");
const dock = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");

test("the radial wheel has no separate lock or unlock setting", () => {
  assert.doesNotMatch(menu, /dock-lock|Lock dock|Unlock dock|dockLocked|dock-lock-state/);
  assert.doesNotMatch(actions, /dock-lock|toggle-dock-lock/);
  assert.match(dock, /aria-label="Move tool wheel"/);
  assert.match(dock, /pointermove/);
});

test("the wheel itself can be moved directly from its central hub", () => {
  assert.match(dock, /onPointerDown=\{startDrag\}/);
  assert.match(dock, /setPosition\(/);
  assert.match(actions, /sketchizi-radial-wheel/);
});
