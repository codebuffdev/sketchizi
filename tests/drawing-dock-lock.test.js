import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const menu = await readFile(new URL("../src/components/app/MoreTools.jsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/features/navigation/useMoreTools.js", import.meta.url), "utf8");
const dock = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("the left sidebar has no separate dock lock or unlock setting", () => {
  assert.doesNotMatch(menu, /dock-lock|Lock dock|Unlock dock|dockLocked|dock-lock-state/);
  assert.doesNotMatch(actions, /dock-lock|toggle-dock-lock/);
  assert.match(dock, /sketchizi-tool-sidebar/);
  assert.doesNotMatch(dock, /Move tool wheel|setPointerCapture|onPointerMove|setPosition\(/);
});

test("the sidebar is fixed to the left edge rather than draggable", () => {
  const rail = styles.match(/\.sketchizi-tool-sidebar\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rail, /position:\s*fixed/);
  const left = Number(rail.match(/\bleft:\s*(\d+)px/)?.[1]);
  assert.ok(left >= 0 && left <= 26, `rail must hug the left edge, got ${left}px`);
  assert.doesNotMatch(styles, /radial-wheel|wheel-hub|dragging/);
});
