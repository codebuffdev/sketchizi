import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("Line and Arrow contextual docks expose all geometry styles", () => {
  for (const style of ["straight", "curved", "elbow", "rounded-elbow"]) {
    assert.match(source, new RegExp('\\["' + style + '",'));
  }
  assert.match(source, /isLine && <DockGroup label="Line type">/);
  assert.match(source, /label="Line type"[\\s\\S]*kind="line-geometry"/);
});

test("geometry changes update selected line and arrow points without replacing arrowheads", () => {
  assert.match(source, /function applyLineGeometryStyle\\(element, style\\)/);
  assert.match(source, /nextPoints = \\[start, \\[([\\s\\S]*?)end\\]/);
  assert.match(source, /roundness = \\{ type: 2 \}/);
  assert.match(source, /customData: \\{ \\.\\.\\.\\(element\\.customData \\|\\| \\{\\}\\), sketchiziLineGeometry: style \\}/);
  assert.match(source, /api\\.updateScene\\(\\{ appState: \\{ currentItemLineGeometry: value \\} \\}\\)/);
});

test("newly drawn lines and arrows receive the selected geometry", () => {
  assert.match(source, /knownLineElementIdsRef/);
  assert.match(source, /!knownIds\\.has\\(element\\.id\\).*element\\.type === tool/s);
  assert.match(source, /appState\\.draggingElement/);
  assert.match(source, /applyLineGeometryStyle\\(element, style\\)/);
});
