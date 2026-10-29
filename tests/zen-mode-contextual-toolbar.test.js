import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("Zen mode pins the contextual formatting rail to the canvas edge", () => {
  assert.match(css, /\.app:has\(button\[aria-label="Exit zen mode"\], button\[title="Exit zen mode"\], button\.exit-zen-mode\) \.contextual-formatting-toolbar\s*\{/);
  assert.match(css, /left:\s*16px !important/);
  assert.match(css, /top:\s*64px !important/);
  assert.match(css, /--format-popover-side:\s*right !important/);
});

test("the fixed formatting rail rule is scoped to Zen mode only", () => {
  const start = css.lastIndexOf("/*\n * Zen mode only:");
  assert.ok(start >= 0, "Zen mode-specific formatting styles should exist");
  const rules = css.slice(start);
  assert.match(rules, /\.app:has\(button\[aria-label="Exit zen mode"\]/);
  assert.doesNotMatch(rules, /^\.app \.contextual-formatting-toolbar\s*\{/m);
});
