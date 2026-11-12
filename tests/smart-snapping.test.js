import test from "node:test";
import assert from "node:assert/strict";
import { snapSceneElementsToSmartGuides } from "../src/features/canvas/smartSnapping.js";
import { calculateAlignmentGuides } from "../src/features/canvas/alignmentGuides.js";

function el(id, x, y, width = 40, height = 40) {
  return { id, x, y, width, height, version: 1, versionNonce: 1, updated: 1 };
}
function baseline(elements) {
  return new Map(elements.map((e) => [e.id, { x: e.x, y: e.y, width: e.width, height: e.height }]));
}

test("snaps a moved selection edge to a nearby stationary edge", () => {
  const start = [el("moving", 150, 10), el("fixed", 100, 10)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 143 }, start[1]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next[0].x, 140);
});

test("equalizes horizontal gaps when moving an element between two aligned elements", () => {
  const start = [el("left", 0, 10), el("moving", 55, 10), el("right", 120, 10)];
  const before = baseline(start);
  const moved = [start[0], { ...start[1], x: 58 }, start[2]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next[1].x, 60);
});

test("preserves relative positions in a multi-selection", () => {
  const start = [el("a", 0, 0), el("b", 60, 0), el("fixed", 120, 0)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 73 }, { ...start[1], x: 133 }, start[2]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["a", "b"]), 8);
  assert.equal(next[1].x - next[0].x, 60);
});

test("does not change elements when nothing is close enough to snap", () => {
  const start = [el("moving", 0, 0), el("fixed", 100, 100)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 40, y: 40 }, start[1]];
  assert.equal(snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 5), moved);
});

test("equalizes vertical gaps when moving an element between two aligned elements", () => {
  const start = [el("top", 10, 0), el("moving", 10, 55), el("bottom", 10, 120)];
  const before = baseline(start);
  const moved = [start[0], { ...start[1], y: 58 }, start[2]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next[1].y, 60);
});

test("snaps centers as well as edges", () => {
  const start = [el("moving", 10, 10), el("fixed", 100, 10, 60, 40)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 111 }, start[1]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next[0].x, 110);
});

test("ignores deleted elements as snap targets", () => {
  const start = [el("moving", 10, 10), { ...el("deleted", 100, 10), isDeleted: true }];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 97 }, start[1]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next, moved);
});

test("returns horizontal spacing markers for approximately equal gaps", async () => {
  const { calculateEqualSpacingGuides } = await import("../src/features/canvas/smartSnapping.js");
  const elements = [el("left", 0, 10), el("moving", 58, 10), el("right", 120, 10)];
  const guides = calculateEqualSpacingGuides(elements, new Set(["moving"]), 4);
  assert.equal(guides.length, 2);
  assert.ok(guides.every((guide) => guide.axis === "x"));
  assert.deepEqual(guides.map((guide) => guide.gap), [18, 22]);
});

test("returns vertical spacing markers for approximately equal gaps", async () => {
  const { calculateEqualSpacingGuides } = await import("../src/features/canvas/smartSnapping.js");
  const elements = [el("top", 10, 0), el("moving", 10, 58), el("bottom", 10, 120)];
  const guides = calculateEqualSpacingGuides(elements, new Set(["moving"]), 4);
  assert.equal(guides.length, 2);
  assert.ok(guides.every((guide) => guide.axis === "y"));
  assert.deepEqual(guides.map((guide) => guide.gap), [18, 22]);
});

test("does not show spacing markers when the gaps are not close to equal", async () => {
  const { calculateEqualSpacingGuides } = await import("../src/features/canvas/smartSnapping.js");
  const elements = [el("left", 0, 10), el("moving", 50, 10), el("right", 120, 10)];
  assert.deepEqual(calculateEqualSpacingGuides(elements, new Set(["moving"]), 4), []);
});

test("does not snap to an object on a different row", () => {
  const start = [el("moving", 10, 10), el("unrelated", 50, 300)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 47, y: 10 }, start[1]];
  assert.equal(snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8), moved);
});

test("snaps to a nearby edge when the objects overlap on the cross axis", () => {
  const start = [el("moving", 10, 10), el("fixed", 100, 15)];
  const before = baseline(start);
  const moved = [{ ...start[0], x: 57 }, start[1]];
  const next = snapSceneElementsToSmartGuides(moved, before, new Set(["moving"]), 8);
  assert.equal(next[0].x, 60);
});

test("alignment guide calculation returns a visible edge guide for nearby objects", () => {
  const elements = [el("moving", 58, 10), el("fixed", 100, 10)];
  const guides = calculateAlignmentGuides(elements, new Set(["moving"]), 5);
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.position === 100));
});

test("alignment guide calculation ignores objects on unrelated rows", () => {
  const elements = [el("moving", 58, 10), el("unrelated", 100, 300)];
  assert.deepEqual(calculateAlignmentGuides(elements, new Set(["moving"]), 5), []);
});
