import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const controller = await readFile(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");

test("quick-connect action is wired from App to the simulation guidance panel", () => {
  assert.match(app, /onCreateRelationBetween=\{workbenchController\.createRelationBetween\}/);
  assert.match(panel, /onCreateTypedRelation=\{onCreateRelationBetween\}/);
  assert.match(simulationPanel, /onCreateTypedRelation\?\.\(\{ sourceId: link\.from\.id, kind: link\.relationKind, targetId: link\.to\.id \}\)/);
});

test("quick-connect creates semantic model data and promotes an existing visual connector when possible", () => {
  assert.match(controller, /const createRelationBetween = useCallback\(\(\{ sourceId, kind, targetId \}\)/);
  assert.match(controller, /findReusableVisualArrow\(scene\.elements, sourceShape, targetShape, workbench\.activeViewId\)/);
  assert.match(controller, /attachWorkbenchRelationToArrow\(element, \{ relationId, viewId: workbench\.activeViewId, kind \}\)/);
  assert.match(controller, /relations: \[\.\.\.workbench\.relations, relation\]/);
  assert.match(controller, /saveDocument\(next, \{ \.\.\.scene, elements \}\)/);
});

test("the run action cannot be started without a typed React Calls relationship", () => {
  assert.match(simulationPanel, /const typedCallMissing = Boolean\(typedRequestGuidance\?\.missingLinks\.some\(\(link\) => link\.relationKind === "calls"\)\)/);
  assert.match(simulationPanel, /disabled=\{!canEdit \|\| missingTrafficSource \|\| unsaved \|\| missingProfileEntityIds\.length > 0 \|\| typedCallMissing/);
  assert.match(simulationPanel, /Create Calls relationship to run/);
});
