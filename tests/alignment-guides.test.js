import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAlignmentGuides,
  calculateEqualSpacingGuides,
  calculateTextBaselineGuides,
  getTextBaseline,
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
