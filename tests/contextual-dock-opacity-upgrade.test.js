import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/contextual-dock-polish.css", import.meta.url), "utf8");

test("opacity is the final shared dock module for every supported tool", () => {
  assert.ok(source.includes('<DockGroup label="Opacity">'));
  assert.ok(source.lastIndexOf('<DockGroup label="Opacity">') > source.lastIndexOf('<DockGroup label="Layer order">'));
  assert.ok(source.includes('className="sk-tool-opacity-scrubber"'));
  assert.ok(source.includes('role="slider" tabIndex={0}'));
  assert.ok(source.includes("opacityPointerStartRef"));
  assert.ok(source.includes("const step = event.shiftKey ? 5 : 1"));
});

test("opacity pill has a live fill, precision slider and quick percentage chips", () => {
  assert.ok(source.includes('className="sk-tool-opacity-fill"'));
  assert.ok(source.includes('aria-label="Precise opacity"'));
  assert.ok(source.includes("[25, 50, 75, 100]"));
  assert.ok(css.includes(".sk-tool-opacity-fill"));
  assert.ok(css.includes("position: absolute;"));
  assert.ok(css.includes("rgba(165,196,250,.16)"));
  assert.ok(css.includes("rgba(59,130,246,.14)"));
  assert.ok(css.includes("min-width: 84px"));
  assert.ok(css.includes("height: 36px"));
});
