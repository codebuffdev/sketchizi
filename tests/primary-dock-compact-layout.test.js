import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Layout contract for the compact Primary Dock.
 *
 * The dock sizes itself from CSS custom properties, so instead of matching exact
 * source text we resolve the effective dimensions for each breakpoint and assert
 * the budgets and invariants that matter: narrow, short, legible, centred and
 * never reaching the header.
 */
const css = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

// Previous (pre-compact) metrics, recorded so the test proves a real reduction.
const BEFORE = { width: 56, buttonW: 42, buttonH: 38, icon: 22, gap: 2, padY: 8, dividerBox: 12, border: 1 };
const TOOL_COUNT = 16;      // every existing tool is preserved
const DIVIDER_COUNT = 1;    // Todo List is separated from the drawing tools

function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function rulesFor(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...source.matchAll(re)].map((m) => declarations(m[1]));
}

function mediaBlock(query) {
  const start = css.indexOf(`@media ${query}`);
  assert.ok(start >= 0, `missing media query: ${query}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error("unterminated media block");
}

const px = (v) => {
  const n = parseFloat(v);
  assert.ok(Number.isFinite(n), `expected a px value, got ${v}`);
  return n;
};

function metrics(overrides = {}) {
  const base = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1));
  const vars = { ...base, ...overrides };
  const button = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button").slice(0, 1));
  const divider = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-divider"));
  const m = {
    buttonW: px(vars["--sk-dock-btn-w"]),
    buttonH: px(vars["--sk-dock-btn-h"]),
    icon: px(vars["--sk-dock-icon"]),
    gap: px(vars["--sk-dock-gap"]),
    padX: px(vars["--sk-dock-pad-x"]),
    padY: px(vars["--sk-dock-pad-y"]),
  };
  const [dividerTop, , dividerBottom] = divider.margin.split(/\s+/).map(px);
  const dividerBox = px(divider.height) + dividerTop + dividerBottom;
  const children = TOOL_COUNT + DIVIDER_COUNT;
  return {
    ...m,
    button,
    width: m.buttonW + 2 * m.padX + 2,
    height: TOOL_COUNT * m.buttonH + dividerBox + (children - 1) * m.gap + 2 * m.padY + 2,
  };
}

test("rail width is derived from the button size and is much narrower than before", () => {
  const m = metrics();
  assert.equal(m.width, m.buttonW + 2 * m.padX + 2);
  assert.ok(m.width <= 46, `desktop rail should be <= 46px wide, got ${m.width}`);
  assert.ok(m.width <= BEFORE.width - 10);
});

test("rail height for the full tool set is reduced without shrinking below usable sizes", () => {
  const m = metrics();
  const beforeHeight = TOOL_COUNT * BEFORE.buttonH + BEFORE.dividerBox + TOOL_COUNT * BEFORE.gap + 2 * BEFORE.padY + 2 * BEFORE.border;
  assert.ok(m.height < beforeHeight * 0.85, `expected >=15% shorter than ${beforeHeight}px, got ${m.height}px`);
  assert.ok(m.buttonH >= 30 && m.buttonW >= 32, "buttons must stay clickable");
  assert.ok(m.icon >= 18 && m.icon <= m.buttonH - 8, "icons must stay legible and fit inside the button with room");
  assert.ok(m.gap <= 2);
});

test("all rail buttons are driven by the shared size variables so alignment stays consistent", () => {
  const { button } = metrics();
  assert.match(button.width, /var\(--sk-dock-btn-w\)/);
  assert.match(button.height, /var\(--sk-dock-btn-h\)/);
  assert.equal(button["box-sizing"], "border-box");
  const svg = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button svg"));
  assert.match(svg.width, /var\(--sk-dock-icon\)/);
  assert.match(svg.height, /var\(--sk-dock-icon\)/);
  const rail = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1));
  assert.equal(rail["align-items"], "center");
});

test("the selected tool keeps a clearly distinct filled state", () => {
  const active = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button.is-active"));
  assert.ok(active.background && active.background !== "transparent");
  assert.ok(active.color);
  const hover = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar-button:hover:not(:disabled)"));
  assert.notEqual(active.background, hover.background);
});

test("rail is height-capped symmetrically below the header so it cannot overlap the hamburger menu", () => {
  const rail = Object.assign({}, ...rulesFor(".sketchizi-tool-sidebar").slice(0, 1));
  assert.equal(rail.top, "50%");
  assert.match(rail["max-height"], /--sketchizi-desktop-header-height/);
  // Cap = viewport - 2 * (header + margin): the centred rail's top edge never rises above the header.
  assert.match(rail["max-height"], /100d?vh\s*-\s*2\s*\*/);
  assert.equal(rail["overflow-y"], "auto");
});

test("phones get a smaller rail and iPad/touch keeps larger hit targets than desktop", () => {
  const desktop = metrics();
  const phoneOverrides = rulesFor(".sketchizi-tool-sidebar", mediaBlock("(max-width: 600px)"))[0];
  const phone = metrics(phoneOverrides);
  assert.ok(phone.width < desktop.width);
  assert.ok(phone.buttonH <= desktop.buttonH);

  const touchOverrides = rulesFor(".sketchizi-tool-sidebar", mediaBlock("(pointer: coarse) and (min-width: 601px)"))[0];
  const touch = metrics(touchOverrides);
  assert.ok(touch.buttonH >= 36, "touch targets must remain finger-sized on iPad");
  assert.ok(touch.buttonH > desktop.buttonH);
  assert.ok(touch.width < BEFORE.width, "even on touch the rail is slimmer than before");
});


test("dock starts as one active-tool control at the bottom-left and expands on demand", async () => {
  const jsx = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
  assert.match(css, /\.sketchizi-tool-sidebar\.is-collapsed\s*\{[\s\S]*?width:\s*48px/);
  assert.match(css, /\.sketchizi-tool-sidebar\.is-collapsed\s*\{[\s\S]*?height:\s*54px/);
  assert.match(css, /\.sketchizi-tool-sidebar\s*\{[\s\S]*?bottom:\s*12px\s*!important/);
  assert.match(jsx, /sketchizi-tool-sidebar-collapsed-button/);
  assert.match(jsx, /onClick=\{\(\) => setExpanded\(true\)\}/);
});

test("tool selection keeps all existing actions and immediately collapses the expanded dock", async () => {
  const jsx = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
  assert.equal((jsx.match(/\{ id: "/g) || []).length, TOOL_COUNT);
  assert.match(jsx, /activateTool\(\{ id: tool\.id, root: rootRef\.current, apiRef, onOpenTodoTab \}\)/);
  assert.match(jsx, /setExpanded\(false\)/);
  assert.match(jsx, /closeOnOutside/);
  assert.match(jsx, /closeOnEscape/);
});
