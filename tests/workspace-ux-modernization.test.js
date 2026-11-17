import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/workspace-ux-modernization.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("contextual formatting is mounted in the standard workspace and self-hides when idle", () => {
  assert.match(canvas, /<ContextualFormattingToolbar[\s\S]*?selectedElements=\{selectedElements\}/);
  assert.doesNotMatch(canvas, /zenModeEnabled \?\? true\) && \(/);
  assert.match(toolbar, /if \(!canEdit \|\| \(!liveSelection\.length && !toolMode\) \|\| !position\) return null/);
});

test("contextual controls use compact neutral surfaces and Sketchizi teal active states", () => {
  assert.match(styles, /width: 40px !important/);
  assert.match(styles, /border-radius: 12px !important/);
  assert.match(styles, /background: #477f91 !important/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(styles, /#8b75f8|#9d87ff|#7165e8|#8276f4/i);
});

test("workspace UX overrides load after the existing editor styles", () => {
  assert.ok(entry.lastIndexOf("workspace-ux-modernization.css") > entry.lastIndexOf("canvas-style-patterns.css"));
});
