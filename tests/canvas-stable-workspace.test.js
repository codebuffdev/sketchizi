import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesheet = readFileSync(new URL("../src/styles/canvas-stable-workspace.css", import.meta.url), "utf8");
const entrypoint = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("desktop workspace keeps the canvas as the permanent full-size base layer", () => {
  assert.match(stylesheet, /\.desktop-workspace\s*\{[\s\S]*?display:\s*block/);
  assert.match(stylesheet, /\.desktop-canvas-region\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*0/);
  assert.doesNotMatch(stylesheet, /grid-template-columns:\s*var\(--sketchizi-desktop-(?:resources|context)-width\)/);
});

test("resource and context panels overlay the canvas instead of consuming grid columns", () => {
  assert.match(stylesheet, /\.desktop-resources-region\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(stylesheet, /\.desktop-context-region\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(stylesheet, /desktop-workspace-context-open\s+\.desktop-context-region/);
  assert.match(stylesheet, /mobile-resource-open/);
});

test("the new workspace layer is limited to desktop and respects reduced motion", () => {
  assert.match(stylesheet, /@media\s*\(min-width:\s*1025px\)/);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(entrypoint, /canvas-stable-workspace\.css/);
});

test("the new layer does not target either toolbar mode", () => {
  assert.doesNotMatch(stylesheet, /sketchizi-dock|ContextualFormattingToolbar|zenModeEnabled/);
});
