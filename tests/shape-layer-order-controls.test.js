import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("shape, arrow, and line contextual docks reuse the existing text layer-order control", () => {
  assert.match(dock, /const isShape = \["rectangle", "diamond", "ellipse"\]\.includes\(type\)/);
  assert.match(dock, /\{\(isShape \|\| isLine\) && <DockGroup label="Layers">\{layerControl\}<\/DockGroup>\}/);
  assert.match(dock, /const isLine = \["line", "arrow"\]\.includes\(type\)/);
  assert.match(dock, /\{layerControl\}\s*<label className="sk-tool-font-family"/);
  assert.equal((dock.match(/\{layerControl\}/g) || []).length, 2);
});

test("shape layer-order menu retains all four existing stacking actions and shortcuts", () => {
  for (const action of ["Bring to front", "Bring forward", "Send backward", "Send to back"]) {
    assert.ok(dock.includes(action), `Missing layer action: ${action}`);
  }
  assert.match(dock, /moveLayers\("front"\)/);
  assert.match(dock, /moveLayers\("forward"\)/);
  assert.match(dock, /moveLayers\("backward"\)/);
  assert.match(dock, /moveLayers\("back"\)/);
});
