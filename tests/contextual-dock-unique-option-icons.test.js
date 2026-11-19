import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const glyph = source.slice(source.indexOf("function DockOptionGlyph("), source.indexOf("\nfunction DockChoiceMenu("));

test("contextual dock option glyphs are selected using both control type and option value", () => {
  assert.match(source, /DockOptionGlyph label=\{label\} value=\{option\.value\} optionLabel=\{option\.label\}/);
  assert.match(glyph, /name\.includes\("font"\)/);
  assert.match(glyph, /name\.includes\("width"\)/);
  assert.match(glyph, /name\.includes\("fill style"\)/);
  assert.match(glyph, /name\.includes\("corner"\)/);
  assert.match(glyph, /name\.includes\("arrowhead"\)/);
  assert.match(glyph, /name\.includes\("pressure"\)/);
});

test("fill, corner, arrowhead and pressure choices have distinct visual representations", () => {
  assert.match(glyph, /value === "solid"/);
  assert.match(glyph, /value === "hachure"/);
  assert.match(glyph, /m8 4 16 16/);
  assert.match(glyph, /value === "rounded"/);
  assert.match(glyph, /value === "arrow"/);
  assert.match(glyph, /value === "bar"/);
  assert.match(glyph, /value === "dot"/);
  assert.match(source, /option value="none"/);
  assert.match(glyph, /value === "on"/);
  assert.match(glyph, /value === "off"/);
});

test("standard option menus never fall back to the same generic circle icon", () => {
  assert.doesNotMatch(glyph, /<circle cx="12" cy="12" r="7"/);
  assert.match(glyph, /optionLabel \|\| value/);
  assert.match(glyph, /abbreviation/);
});

test("existing visual option families retain dedicated line, geometry and roughness glyphs", () => {
  assert.match(source, /kind === "line-style" \|\| kind === "line-geometry" \|\| kind === "roughness"/);
  assert.match(source, /const paths = \{/);
});
