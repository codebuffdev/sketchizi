import test from "node:test";
import assert from "node:assert/strict";
import { calculateAlignmentGuides } from "../src/features/canvas/alignmentGuides.js";

test("detects matching vertical and horizontal alignment edges", () => {
  const elements = [
    { id: "moving", x: 98, y: 198, width: 40, height: 40 },
    { id: "fixed", x: 100, y: 160, width: 40, height: 40 },
  ];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 3);
  assert.ok(guides.some((guide) => guide.axis === "x" && Math.abs(guide.position - 100) < 2));
  assert.ok(guides.some((guide) => guide.axis === "y" && Math.abs(guide.position - 200) < 2));
});

test("ignores deleted elements and the moving selection itself", () => {
  const elements = [
    { id: "moving", x: 10, y: 10, width: 20, height: 20 },
    { id: "deleted", x: 10, y: 10, width: 20, height: 20, isDeleted: true },
  ];
  assert.deepEqual(calculateAlignmentGuides(elements, new Set(["moving"])), []);
});

test("returns no guides when selection or stationary elements are missing", () => {
  const elements = [{ id: "one", x: 0, y: 0, width: 20, height: 20 }];
  assert.deepEqual(calculateAlignmentGuides(elements, new Set(["one"])), []);
  assert.deepEqual(calculateAlignmentGuides(elements, new Set()), []);
});
