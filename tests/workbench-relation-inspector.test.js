import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("selected semantic connector resolves to its typed relation model record", () => {
  assert.match(controller, /selectedRelationIds[\s\S]*customData\?\.workbench\?\.relationId/);
  assert.match(controller, /workbench\?\.relations\?\.find\(\(relation\) => relation\.id === selectedRelationIds\[0\]\)/);
  assert.match(app, /selectedRelation=\{workbenchController\.selectedRelation\}/);
});

test("relationship inspector displays type, source, target, semantic ID and view", () => {
  for (const label of ["Relationship type", "Source component", "Target component", "Semantic ID", "Design view"]) {
    assert.ok(panel.includes(label), `missing inspector field: ${label}`);
  }
  assert.match(panel, /TYPED RELATIONSHIP/);
  assert.match(panel, /semantic relationship—not the arrow's color—is the source of truth/);
});

test("connected relationship entries provide a canvas trace action", () => {
  assert.match(panel, /onFocusRelation\?\.\(relation\.id\)/);
  assert.match(controller, /const focusRelation = useCallback/);
  assert.match(controller, /selectedElementIds: \{ \[connector\.id\]: true \}/);
  assert.match(controller, /scrollToContent\?\.\(\[connector\]/);
  assert.match(styles, /workbench-existing-relation-button:focus-visible/);
});
