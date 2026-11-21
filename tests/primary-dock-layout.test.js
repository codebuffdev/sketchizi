import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/workspace-ui-redesign.css", import.meta.url), "utf8");

test("primary tool dock is anchored 12px from the bottom-left and expands upward", () => {
  assert.match(styles, /\.sketchizi-tool-sidebar\s*\{[^}]*left:\s*12px;[^}]*bottom:\s*12px;/s);
  assert.match(styles, /\.sketchizi-tool-sidebar\.is-expanded \.sketchizi-tool-sidebar-list/);
  assert.match(styles, /max-height:\s*calc\(100dvh - 100px\)/);
  assert.match(styles, /\.sketchizi-tool-sidebar-collapsed/);
});

test("primary dock keeps the active tool visible while collapsed", () => {
  assert.match(component, /sketchizi-tool-sidebar-active/);
  assert.match(component, /Active tool: \$\{activeToolMeta\.label\}/);
  assert.match(component, /inert=\{!expanded\}/);
  assert.match(component, /inert=\{expanded\}/);
});

test("primary dock preserves native, custom, image, and Todo tool activation", () => {
  for (const tool of ["selection", "hand", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "frame", "eraser", "laser", "bucketfill", "autoshape", "todo"]) {
    assert.ok(component.includes(`id: "${tool}"`), `missing ${tool} tool`);
  }
  assert.match(component, /sketchizi:activate-tool/);
  assert.match(component, /onOpenTodoTab\?\.\(\)/);
  assert.match(component, /toolbar-image/);
});

test("primary dock exposes shortcut badges only inside hover tooltips", () => {
  for (const hint of ["V", "H", "R", "O", "D", "A", "L", "P", "T", "I", "F", "E", "K"]) {
    assert.ok(component.includes(`keyHint: "${hint}"`), `missing shortcut hint ${hint}`);
  }
  assert.match(component, /sketchizi-tool-sidebar-tooltip/);
});

test("expanded dock collapses automatically without a redundant text control", () => {
  assert.doesNotMatch(component, /sketchizi-tool-sidebar-collapse(?=["\\s])/);
  assert.match(component, /onMouseLeave=\{scheduleCollapse\}/);
  assert.match(component, /setTimeout\(\(\) => \{/);
  assert.match(component, /requestAnimationFrame\(\(\) => firstToolButtonRef\.current\?\.focus\(\)\)/);
  assert.match(component, /requestAnimationFrame\(\(\) => activeButtonRef\.current\?\.focus\(\)\)/);
});
