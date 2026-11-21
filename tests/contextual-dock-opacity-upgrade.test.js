import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/contextual-dock-polish.css", import.meta.url), "utf8");

test("opacity remains the final shared module and exposes keyboard and pointer controls", () => {
  assert.match(source, /<DockGroup label="Opacity">[\\s\\S]*?className="sk-tool-opacity-scrubber"/);
  assert.ok(source.lastIndexOf('<DockGroup label="Opacity">') > source.lastIndexOf('<DockGroup label="Layer order">'));
  assert.match(source, /onPointerMove=\{\(event\) => \{/);
  assert.match(source, /opacityPointerStartRef/);
  assert.match(source, /event\.shiftKey \? 5 : 1/);
  assert.match(source, /role="slider" tabIndex=\{0\}/);
});

test("opacity pill includes liquid fill, precision slider, and quick percentage presets", () => {
  assert.match(source, /className="sk-tool-opacity-fill" style=\{\{ width: `\$\{opacityValue\}%` \}\}/);
  assert.match(source, /aria-label="Precise opacity"/);
  assert.match(source, /\[25, 50, 75, 100\]/);
  assert.match(css, /\.sk-tool-opacity-fill[\\s\\S]*?position: absolute[\\s\\S]*?left: 0[\\s\\S]*?top: 0[\\s\\S]*?bottom: 0/);
  assert.match(css, /rgba\(165,196,250,.16\)/);
  assert.match(css, /rgba\(59,130,246,.14\)/);
  assert.match(css, /min-width: 84px/);
  assert.match(css, /height: 36px/);
});
