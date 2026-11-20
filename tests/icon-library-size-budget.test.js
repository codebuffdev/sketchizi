import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The Icon Library is sized by several stacked CSS files. The browser smoke test
 * requires the rendered panel to stay within 322px wide and 462px tall. This test
 * resolves the *last* !important width/height declared for the panel at each
 * breakpoint (later rules win at equal specificity) and checks the budget, so a
 * later "centering" or "redesign" rule cannot silently re-inflate the panel.
 */
const css = readFileSync(new URL("../src/styles/icon-library-redesign.css", import.meta.url), "utf8");
const MAX_W = 322;
const MAX_H = 462;

function lastSizing(block, prop) {
  const re = new RegExp(`${prop}:\\s*min\\((\\d+)px`, "g");
  const all = [...block.matchAll(re)].map((m) => Number(m[1]));
  return all.length ? all[all.length - 1] : undefined;
}

test("centred Icon Library panel (desktop) stays within the compact width/height budget", () => {
  // The centring rule is the last (authoritative) rule that sizes the panel at >=761px.
  const idx = css.lastIndexOf("Center the compact Icon Library");
  assert.ok(idx > 0, "centring rule must exist");
  const block = css.slice(idx);
  const width = lastSizing(block, "width");
  const height = lastSizing(block, "height");
  assert.ok(width <= MAX_W, `desktop panel width ${width}px exceeds ${MAX_W}px`);
  assert.ok(height <= MAX_H, `desktop panel height ${height}px exceeds ${MAX_H}px`);
  assert.ok(width >= 270 && height >= 260, "panel must not collapse below a usable size");
});

test("phone Icon Library panel is bounded by the same budget and the viewport", () => {
  const marker = css.indexOf("Final compact-panel card sizing");
  assert.ok(marker > 0, "final phone sizing rule must exist");
  const rule = css.slice(marker, marker + 900);
  const width = lastSizing(rule, "width");
  const height = lastSizing(rule, "height");
  assert.ok(width <= MAX_W, `phone panel width ${width}px exceeds ${MAX_W}px`);
  assert.ok(height <= MAX_H, `phone panel height ${height}px exceeds ${MAX_H}px`);
  assert.match(rule, /max-width:\s*calc\(100vw/, "phone panel must be viewport bounded");
});
