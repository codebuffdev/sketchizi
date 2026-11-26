import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");
function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function rulesFor(selector) {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").some((part) => part.trim() === selector))
    .map((m) => declarations(m[2]));
}
const merged = (selector) => Object.assign({}, ...rulesFor(selector));

test("dock is exactly 44px wide: 32px slots inside 6px padding, border drawn as an inset shadow", () => {
  const dock = merged(".sketchizi-tool-sidebar");
  assert.equal(dock.width, "44px");
  assert.equal(dock.padding, "6px");
  assert.equal(dock["box-sizing"], "border-box");
  assert.equal(dock["border-radius"], "9999px !important");
  assert.match(dock["box-shadow"], /inset 0 0 0 1px var\(--sk-dock-line\)/);
  assert.equal(32 + 2 * 6, 44);
});

test("slots and child buttons are 32x32 radius 8 with a 4px gap", () => {
  const button = merged(".sketchizi-tool-sidebar-button");
  assert.equal(button.width, "32px"); assert.equal(button.height, "32px");
  assert.equal(button["border-radius"], "8px");
  assert.equal(merged(".sketchizi-tool-sidebar-list").gap, "4px");
  assert.equal(merged(".sketchizi-tool-sidebar-child-rail").gap, "4px");
});

test("20px dividers separate the three sections", () => {
  const divider = merged(".sketchizi-tool-sidebar-divider");
  assert.equal(divider.width, "20px"); assert.equal(divider.height, "1px");
});

test("nested child rail is 44px wide with the current capsule surface and pointer bridge", () => {
  const rail = merged(".sketchizi-tool-sidebar-child-rail");
  assert.equal(rail.position, "absolute"); assert.equal(rail.left, "56px"); assert.equal(rail.width, "44px");
  assert.equal(rail.padding, "6px"); assert.equal(rail["border-radius"], "18px");
  assert.match(css, /\.tool-slot > \.sub-dock \{[\s\S]*?left: calc\(100% \+ 12px\)/);
  assert.match(css, /\.tool-slot > \.sub-dock::before \{[\s\S]*?width: 12px/);
});

test("the selected tool keeps a clearly distinct filled state with no outline or shadow", () => {
  const active = merged(".sketchizi-tool-sidebar-button.is-active");
  assert.equal(active.background, "var(--sk-dock-active-bg)");
  assert.match(css, /--sk-dock-active-bg: #F3E8FF/); assert.match(css, /--sk-dock-active-fg: #6D28D9/);
  assert.equal(active["box-shadow"], "none"); assert.equal(active.outline, "none");
  const hover = merged(".sketchizi-tool-sidebar-button:hover:not(:disabled)");
  assert.notEqual(active.background, hover.background);
});

test("dock is height-capped, vertically scrollable inside the list only, and never scrolls horizontally", () => {
  const dock = merged(".sketchizi-tool-sidebar");
  assert.match(dock.position, /^fixed/); assert.match(dock["max-height"], /100dvh\s*-\s*112px/);
  assert.match(css, /\.sketchizi-tool-sidebar\.is-expanded \.sketchizi-tool-sidebar-list \{[^}]*overflow-y: auto/);
  assert.equal(merged(".sketchizi-tool-sidebar-list")["overflow-x"], "hidden");
  assert.match(css, /\.sketchizi-tool-sidebar,\s*\.sketchizi-tool-sidebar-child-rail,\s*\.sketchizi-tool-sidebar-hover-bridge \{\s*overflow: visible !important;/);
});

test("coarse pointers get a larger hit area without changing the 32px visuals", () => {
  assert.match(css, /@media \(pointer: coarse\) \{[\s\S]*?inset: -2px/);
});
