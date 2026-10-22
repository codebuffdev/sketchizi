import test from "node:test";
import assert from "node:assert/strict";
import { attachWorkbenchRelationToArrow, findReusableVisualArrow, relationVisualStyle } from "../src/features/workbench/typedRelationScene.js";

test("finds an existing bound visual arrow with the semantic direction and active view", () => {
  const elements = [
    { id: "a1", type: "arrow", startBinding: { elementId: "source" }, endBinding: { elementId: "target" }, customData: {} },
    { id: "a2", type: "arrow", startBinding: { elementId: "target" }, endBinding: { elementId: "source" }, customData: {} },
  ];
  assert.equal(findReusableVisualArrow(elements, { id: "source" }, { id: "target" }, "system"), 0);
  assert.equal(findReusableVisualArrow(elements, { id: "source" }, { id: "missing" }, "system"), -1);
});

test("does not reuse an arrow already assigned to a Workbench relation", () => {
  const elements = [{ id: "a1", type: "arrow", startBinding: { elementId: "source" }, endBinding: { elementId: "target" }, customData: { workbench: { relationId: "existing" } } }];
  assert.equal(findReusableVisualArrow(elements, { id: "source" }, { id: "target" }, "system"), -1);
});

test("can promote a uniquely matching unbound visual arrow by its endpoint geometry", () => {
  const source = { id: "source", x: 0, y: 0, width: 100, height: 60 };
  const target = { id: "target", x: 200, y: 100, width: 100, height: 60 };
  const elements = [{ id: "visual", type: "arrow", x: 100, y: 30, width: 100, height: 100, points: [[0, 0], [100, 100]], customData: {} }];
  assert.equal(findReusableVisualArrow(elements, source, target, "system"), 0);
});

test("does not reuse an arrow from an inactive view", () => {
  const elements = [{ id: "a1", type: "arrow", startBinding: { elementId: "source" }, endBinding: { elementId: "target" }, customData: { workbench: { viewId: "data" } } }];
  assert.equal(findReusableVisualArrow(elements, { id: "source" }, { id: "target" }, "system"), -1);
});

test("attaches relation metadata without discarding arrow bindings or styles", () => {
  const arrow = { id: "a1", type: "arrow", strokeColor: "#fff", startBinding: { elementId: "source" }, endBinding: { elementId: "target" }, customData: { userData: "preserve" } };
  const result = attachWorkbenchRelationToArrow(arrow, { relationId: "r1", viewId: "system", kind: "calls" });
  assert.equal(result.strokeColor, relationVisualStyle("calls").strokeColor);
  assert.deepEqual(result.startBinding, arrow.startBinding);
  assert.deepEqual(result.endBinding, arrow.endBinding);
  assert.equal(result.customData.userData, "preserve");
  assert.deepEqual(result.customData.workbench, { relationId: "r1", viewId: "system", role: "relation", kind: "calls" });
});


test("relation visual styles distinguish common connector semantics", () => {
  assert.notEqual(relationVisualStyle("calls").strokeColor, relationVisualStyle("writes").strokeColor);
  assert.notEqual(relationVisualStyle("reads").strokeColor, relationVisualStyle("authenticates-with").strokeColor);
  assert.equal(relationVisualStyle("unknown-kind").strokeColor, relationVisualStyle("depends-on").strokeColor);
  assert.equal(relationVisualStyle("calls").endArrowhead, "arrow");
});

test("promoting an existing arrow applies semantic styling and preserves user metadata", () => {
  const arrow = { id: "a1", type: "arrow", strokeColor: "#fff", strokeWidth: 1, customData: { note: "keep" } };
  const result = attachWorkbenchRelationToArrow(arrow, { relationId: "r1", viewId: "system", kind: "writes" });
  assert.equal(result.strokeColor, relationVisualStyle("writes").strokeColor);
  assert.equal(result.strokeWidth, 2);
  assert.equal(result.customData.note, "keep");
  assert.equal(result.customData.workbench.kind, "writes");
});
