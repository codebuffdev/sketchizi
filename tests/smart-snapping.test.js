import test from "node:test";
import assert from "node:assert/strict";
import { snapSceneElementsToSmartGuides } from "../src/features/canvas/smartSnapping.js";

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
