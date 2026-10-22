import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("relationship inspector exposes staged type and endpoint editing", () => {
  assert.match(panel, /Edit relationship/);
  assert.match(panel, /editRelationKind/);
  assert.match(panel, /editRelationSourceId/);
  assert.match(panel, /editRelationTargetId/);
  assert.match(panel, /Save relationship changes/);
});

test("relationship edits validate against the semantic model before saving", () => {
  assert.match(controller, /const updateRelation = useCallback/);
  assert.match(controller, /validateRelationAgainstModel\(kind, sourceEntity, targetEntity, workbench\.entities, remainingRelations\)/);
  assert.match(controller, /Both relationship endpoints must exist in the relationship's design view/);
});

test("relationship edits update connector metadata and visual style", () => {
  assert.match(controller, /\.\.\.relationVisualStyle\(kind\)/);
  assert.match(controller, /relationId, viewId: relationViewId, role: "relation", kind/);
  assert.match(app, /onUpdateRelation=\{workbenchController\.updateRelation\}/);
});
