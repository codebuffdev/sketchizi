import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const primary = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const contextual = await readFile(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const primaryStyles = await readFile(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");
const contextualStyles = await readFile(new URL("../src/styles/contextual-dock-polish.css", import.meta.url), "utf8");

test("both docks retain hover for three seconds and clear pending timers on re-entry", () => {
  assert.match(primary, /const COLLAPSE_GRACE_MS = 3000/);
  assert.match(primary, /onMouseEnter=\{expandDock\}/);
  assert.match(primary, /onMouseLeave=\{scheduleCollapse\}/);
  assert.match(primary, /cancelCollapseTimer\(\)/);
  assert.match(contextual, /}, 3000\)/);
  assert.match(contextual, /onMouseEnter=\{expandDock\}/);
  assert.match(contextual, /onMouseLeave=\{scheduleDockCollapse\}/);
  assert.match(contextual, /cancelDockCollapse\(\)/);
});

test("selection and discrete tool choices collapse immediately", () => {
  assert.match(primary, /previousSelectionKeyRef/);
  assert.match(primary, /setExpanded\(false\)/);
  assert.match(contextual, /previousSelectionKeyRef/);
  assert.match(contextual, /previousToolRef/);
  assert.match(contextual, /collapseDockImmediately\(\)/);
  assert.match(contextual, /onClickCapture=/);
  assert.match(contextual, /onChangeCapture=/);
});

test("contextual dock defers collapse while popovers, inputs, or opacity dragging are active", () => {
  assert.match(contextual, /const isInputFocused/);
  assert.match(contextual, /const isPopoverOpen/);
  assert.match(contextual, /opacityDragging \|\| isInputFocused \|\| isPopoverOpen/);
  assert.match(contextual, /opacityPopoverOpen \|\| fontSizePopoverOpen \|\| layerMenuOpen/);
  assert.match(contextual, /useEffect\(\(\) => \(\) => cancelDockCollapse\(\), \[\]\)/);
});

test("both docks use smooth downward fade and disable pointer events when collapsed", () => {
  assert.match(primaryStyles, /transition: opacity 180ms ease, transform 200ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(primaryStyles, /translateY\(8px\)/);
  assert.match(contextualStyles, /transition: opacity 180ms ease, transform 200ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(contextualStyles, /\.sketchizi-tool-options-dock\.is-collapsed/);
  assert.match(contextualStyles, /pointer-events: none/);
});
