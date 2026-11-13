import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAlignmentGuides,
  calculateEqualSpacingGuides,
  calculateTextBaselineGuides,
  getTextBaseline,
  selectDisplayGuides,
} from "../src/features/canvas/alignmentGuides.js";

test("detects edge and center alignment with overlapping geometry", () => {
  const elements = [
    { id: "moving", x: 98, y: 198, width: 40, height: 40 },
    { id: "fixed", x: 100, y: 160, width: 40, height: 80 },
  ];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 3);
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.position === 100));
  assert.ok(guides.some((guide) => guide.axis === "y" && guide.position === 200));
});

test("aligns objects on the same X coordinate even when vertically separated", () => {
  const elements = [
    { id: "moving", x: 0, y: 0, width: 20, height: 20 },
    { id: "fixed", x: 1, y: 200, width: 20, height: 20 },
  ];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 3);
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.position === 1));
  assert.ok(!guides.some((guide) => guide.axis === "y"));
});

test("aligns objects on the same Y coordinate even when horizontally separated", () => {
  const elements = [
    { id: "moving", x: 0, y: 0, width: 20, height: 20 },
    { id: "fixed", x: 200, y: 1, width: 20, height: 20 },
  ];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 3);
  assert.ok(guides.some((guide) => guide.axis === "y" && guide.position === 1));
  assert.ok(!guides.some((guide) => guide.axis === "x"));
});

test("limits alignment output to the closest guide on each axis", () => {
  const elements = [
    { id: "moving", x: 0, y: 0, width: 20, height: 20 },
    { id: "near", x: 1, y: 200, width: 20, height: 20 },
    { id: "far", x: 3, y: 400, width: 20, height: 20 },
  ];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 5);
  assert.equal(guides.filter((guide) => guide.axis === "x").length, 1);
  assert.equal(guides.filter((guide) => guide.axis === "y").length, 0);
  assert.equal(guides.find((guide) => guide.axis === "x").position, 1);
});

test("ignores deleted elements and the moving selection itself", () => {
  const elements = [
    { id: "moving", x: 10, y: 10, width: 20, height: 20 },
    { id: "deleted", x: 10, y: 10, width: 20, height: 20, isDeleted: true },
  ];
  assert.deepEqual(calculateAlignmentGuides(elements, new Set(["moving"])), []);
});

test("detects equal horizontal gaps around a single moving object", () => {
  const elements = [
    { id: "left", x: 0, y: 0, width: 20, height: 20 },
    { id: "moving", x: 44, y: 0, width: 20, height: 20 },
    { id: "right", x: 90, y: 0, width: 20, height: 20 },
  ];
  const guides = calculateEqualSpacingGuides(elements, new Set(["moving"]), 2);
  assert.ok(guides.some((guide) => guide.axis === "x" && Math.abs(guide.delta - 1) < 0.001));
});

test("detects text baseline alignment using text metrics", () => {
  const elements = [
    { id: "a", type: "text", x: 0, y: 0, width: 100, height: 30, fontSize: 20 },
    { id: "b", type: "text", x: 120, y: 2, width: 100, height: 28, fontSize: 18 },
  ];
  assert.ok(Math.abs(getTextBaseline(elements[0]) - getTextBaseline(elements[1])) < 1);
  assert.equal(calculateTextBaselineGuides(elements, new Set(["a"]), 2).length, 1);
});

test("returns no guides when selection or stationary elements are missing", () => {
  const elements = [{ id: "one", x: 0, y: 0, width: 20, height: 20 }];
  assert.deepEqual(calculateAlignmentGuides(elements, new Set(["one"])), []);
  assert.deepEqual(calculateEqualSpacingGuides(elements, new Set(["one"])), []);
});

test("displays no more than one guide per axis across guide kinds", () => {
  const guides = [
    { axis: "x", kind: "alignment", position: 10, distance: 1 },
    { axis: "x", kind: "alignment", position: 12, distance: 0 },
    { axis: "y", kind: "alignment", position: 20, distance: 0 },
    { axis: "y", kind: "baseline", position: 21, distance: 2 },
    { axis: "x", kind: "spacing", position: 15, distance: 0 },
  ];
  const selected = selectDisplayGuides(guides);
  assert.equal(selected.length, 2);
  assert.equal(selected.find((guide) => guide.axis === "x").position, 12);
  assert.equal(selected.find((guide) => guide.axis === "y").kind, "baseline");
});
