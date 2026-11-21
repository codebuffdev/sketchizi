import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");
function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function rulesFor(selector, source = css) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  return [...source.matchAll(re)]
    .filter((m) => m[1].split(",").some((part) => part.trim() === selector))
    .map((m) => declarations(m[2]));
}
function mediaBlock(query) {
  const start = css.indexOf("@media " + query);
  assert.ok(start >= 0, "missing media query: " + query);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unterminated media block");
}
const px = (v) => { const n = parseFloat(v); assert.ok(Number.isFinite(n), "expected px value: " + v); return n; };
function metrics(overrides = {}) {
  const rail = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1), overrides);
  const button = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button").slice(0, 1));
  const divider = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-divider"));
  const w = px(rail["--sk-dock-btn-w"]), h = px(rail["--sk-dock-btn-h"]), icon = px(rail["--sk-dock-icon"]);
  const gap = px(rail["--sk-dock-gap"]), padX = px(rail["--sk-dock-pad-x"]), padY = px(rail["--sk-dock-pad-y"]);
  const margins = divider.margin.split(/\s+/).map(px);
  const dividerBox = px(divider.height) + margins[0] + margins[2];
  return { w, h, icon, gap, button, width: w + 2 * padX + 2, height: 16 * h + dividerBox + 16 * gap + 2 * padY + 2 };
}
test("rail width is derived from button size and remains compact", () => {
  const m = metrics(); assert.equal(m.width, m.w + 14); assert.ok(m.width <= 46);
});
test("rail height stays compact without shrinking below usable sizes", () => {
  const m = metrics(); assert.ok(m.height <= 570); assert.ok(m.h >= 30 && m.w >= 32); assert.ok(m.icon >= 18 && m.icon <= m.h - 8); assert.ok(m.gap <= 2);
});
test("all rail buttons use shared dimensions and centered alignment", () => {
  const m = metrics(); assert.match(m.button.width, /var\(--sk-dock-btn-w\)/); assert.match(m.button.height, /var\(--sk-dock-btn-h\)/); assert.equal(m.button["box-sizing"], "border-box");
  const svg = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button svg")); assert.match(svg.width, /var\(--sk-dock-icon\)/); assert.match(svg.height, /var\(--sk-dock-icon\)/);
  const rail = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1)); assert.equal(rail["align-items"], "center");
});
test("the selected tool keeps a clearly distinct filled state", () => {
  const active = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button.is-active")); assert.ok(active.background && active.background !== "transparent"); assert.ok(active.color);
  const hover = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button:hover:not(:disabled)")); assert.notEqual(active.background, hover.background);
});
test("bottom-left dock is height-capped and its expanded list scrolls", () => {
  const rail = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1)); assert.equal(rail.position, "fixed"); assert.equal(rail.bottom, "58px"); assert.match(rail["max-height"], /100dvh\s*-\s*112px/); assert.equal(rail.overflow, "hidden");
  assert.match(css, /\.sketchizi-tool-sidebar-list[\s\S]*?overflow-y:\s*auto/); assert.match(css, /\.sketchizi-tool-sidebar\.is-expanded \.sketchizi-tool-sidebar-list/);
});
test("phones get a smaller dock and iPad/touch keeps larger hit targets than desktop", () => {
  const desktop = metrics(); const phone = metrics(rulesFor(".sketchizi-tool-sidebar", mediaBlock("(max-width: 600px)"))[0]); assert.ok(phone.width < desktop.width); assert.ok(phone.h <= desktop.h);
  const touch = metrics(rulesFor(".sketchizi-tool-sidebar", mediaBlock("(pointer: coarse) and (min-width: 601px)"))[0]); assert.ok(touch.h >= 36); assert.ok(touch.h > desktop.h); assert.ok(touch.width <= 46);
});
