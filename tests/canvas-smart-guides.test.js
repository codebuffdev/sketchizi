import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAlignmentGuides,
  findNearestAlignment,
  findNearestEqualSpacing,
} from "../src/features/canvas/alignmentGuides.js";

const rect = (id, x, y, width, height) => ({ id, type: "rectangle", x, y, width, height, isDeleted: false });

test("findNearestAlignment detects edge alignment within scene tolerance", () => {
  const moving = [rect("moving", 102, 20, 40, 30)];
  const stationary = [rect("target", 150, 20, 40, 30)];
  const result = findNearestAlignment(moving, stationary, "x", 10);
  assert.equal(result.delta, 8);
  assert.equal(result.position, 150);
});

test("findNearestAlignment ignores objects without perpendicular overlap", () => {
  const moving = [rect("moving", 102, 20, 40, 30)];
  const stationary = [rect("target", 150, 80, 40, 30)];
  assert.equal(findNearestAlignment(moving, stationary, "x", 10), null);
});

test("findNearestEqualSpacing finds the centered position between two objects", () => {
  const moving = [rect("moving", 110, 20, 40, 30)];
  const stationary = [rect("left", 20, 20, 40, 30), rect("right", 180, 20, 40, 30)];
  const result = findNearestEqualSpacing(moving, stationary, "x", 20);
  assert.equal(result.delta, -10);
  assert.equal(result.position, 100);
  assert.equal(result.kind, undefined);
});

test("findNearestEqualSpacing does not snap when the correction exceeds tolerance", () => {
  const moving = [rect("moving", 130, 20, 40, 30)];
  const stationary = [rect("left", 20, 20, 40, 30), rect("right", 180, 20, 40, 30)];
  assert.equal(findNearestEqualSpacing(moving, stationary, "x", 5), null);
});

test("calculateAlignmentGuides returns scene-space guides for selected elements", () => {
  const elements = [rect("moving", 100, 20, 40, 30), rect("target", 140, 20, 40, 30)];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 0);
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.position === 140));
});
