import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("Line and Arrow contextual docks expose all geometry styles", () => {
  for (const style of ["straight", "curved", "elbow", "rounded-elbow"]) {
    assert.ok(source.includes(`["${style}",`), `missing ${style} geometry option`);
  }
  assert.ok(source.includes('{isLine && <VisualOptionSelect label="Line routing"'));
  assert.ok(source.includes('label="Line routing" value={lineGeometry} onChange={updateLineGeometry} kind="line-geometry"'));
});

test("geometry changes update selected line and arrow points while retaining element properties", () => {
  assert.ok(source.includes("function applyLineGeometryStyle(element, style)"));
  assert.ok(source.includes("nextPoints = [start, ["));
  assert.ok(source.includes("roundness = { type: 2 }"));
  assert.ok(source.includes("...element,"));
  assert.ok(source.includes("sketchiziLineGeometry: style"));
  assert.ok(source.includes("api.updateScene({ appState: { currentItemLineGeometry: value } })"));
});

test("newly drawn lines and arrows receive the selected geometry after the drag ends", () => {
  assert.ok(source.includes("knownLineElementIdsRef"));
  assert.ok(source.includes("!knownIds.has(element.id)"));
  assert.ok(source.includes("appState.draggingElement"));
  assert.ok(source.includes("applyLineGeometryStyle(element, style)"));
});
