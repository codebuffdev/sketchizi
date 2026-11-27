import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALL_CHILDREN } from "../src/components/app/primaryDockModel.js";

const component = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("primary tool dock is anchored at the bottom-left and expands upward", () => {
  assert.match(styles, /\.sketchizi-tool-sidebar\s*\{[^}]*left:\s*16px;[^}]*bottom:\s*58px;/s);
  assert.match(styles, /\.sketchizi-tool-sidebar\.is-expanded \.sketchizi-tool-sidebar-list/);
  assert.match(styles, /max-height:\s*calc\(100dvh - 112px - 60px\)/);
  assert.match(styles, /\.sketchizi-tool-sidebar-collapsed/);
});

test("primary dock keeps the active tool visible while collapsed", () => {
  assert.match(component, /sketchizi-tool-sidebar-active/);
  assert.match(component, /Active tool: \$\{pillChild\.label\}/);
  assert.match(component, /inert=\{!expanded\}/);
  assert.doesNotMatch(component, /inert=\{expanded\}/);
});

test("primary dock preserves native, custom and image tool activation; Todo/Bucket/Draw-to-Shape left the dock", () => {
  const tools = new Set(ALL_CHILDREN.map((child) => child.tool).filter(Boolean));
  for (const tool of ["selection", "lasso", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill"]) {
    assert.ok(tools.has(tool), `missing ${tool} tool`);
  }
  assert.match(component, /sketchizi:activate-tool/);
  assert.match(component, /toolbar-image/);
  assert.match(component, /onOpenTodoTab/);
  assert.ok(ALL_CHILDREN.some((child) => child.id === "todo" && child.kind === "action"));
});

test("primary dock exposes keyboard hints only for supported, non-colliding shortcuts", () => {
  const hinted = ALL_CHILDREN.filter((child) => child.keyHint).map((child) => child.keyHint).sort();
  assert.deepEqual(hinted, ["A", "B", "C", "E", "H", "I", "K", "L", "O", "R", "T", "V"]);
  // Keys bound by app-level handlers (useSketchiziPreferences.js) are never advertised.
  for (const colliding of ["D", "G", "P", "M", "F"]) assert.ok(!hinted.includes(colliding));
  assert.match(component, /tooltipLabel/);
});

test("expanded dock collapses automatically without a redundant text control", () => {
  assert.doesNotMatch(component, /sketchizi-tool-sidebar-collapse(?=["\\s])/);
  assert.match(component, /onMouseLeave=\{hoverCollapse\}/);
  assert.match(component, /setTimeout\(\(\) => \{/);
  assert.match(component, /requestAnimationFrame\(\(\) => firstSlotButtonRef\.current\?\.focus\(\)\)/);
  assert.match(component, /requestAnimationFrame\(\(\) => activeButtonRef\.current\?\.focus\(\)\)/);
});
