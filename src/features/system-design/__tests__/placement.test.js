import test from "node:test";
import assert from "node:assert/strict";
import { PLACEMENT_GAP_X, COLLISION_PAD, isRectInView, planPlacement, scrollToReveal } from "../placement.js";
import { NODE_SIZE, createEdgeSkeleton } from "../sceneModel.js";
import { isOrthogonal, routeOrthogonal } from "../orthogonalRouter.js";

const node = (id, x, y) => ({ id, x, y, ...NODE_SIZE });
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const rect = (p) => ({ ...p, ...NODE_SIZE });

test("with a selection the new node lands PLACEMENT_GAP_X clear of the selected node's right edge, same row", () => {
  const sel = node("a", 100, 200);
  const { position, anchored } = planPlacement({ nodes: [sel], selectedNode: sel });
  assert.ok(anchored);
  assert.equal(position.x, sel.x + sel.width + PLACEMENT_GAP_X);
  assert.equal(position.y, sel.y);
});

test("the gap is wide enough for a facing elbow (no wrap-around loop)", () => {
  const sel = node("a", 0, 0);
  const { position } = planPlacement({ nodes: [sel], selectedNode: sel });
  const skeleton = createEdgeSkeleton(sel, { id: "b", ...rect(position), protocol: "HTTPS" }, {}, "e");
  assert.equal(skeleton.customData.sketchiziSystemDesign.fromPort, "right");
  assert.equal(skeleton.customData.sketchiziSystemDesign.toPort, "left");
  const route = routeOrthogonal(sel, "right", rect(position), "left");
  assert.ok(isOrthogonal(route));
  assert.ok(route.every((p) => p.x >= sel.x + sel.width && p.x <= position.x), "route stays between the two cards");
});

test("an occupied slot stacks siblings in the same column, never on top of each other", () => {
  const sel = node("a", 0, 0);
  const nodes = [sel];
  const placed = [];
  for (let i = 0; i < 6; i += 1) {
    const { position } = planPlacement({ nodes, selectedNode: sel });
    assert.equal(position.x, sel.x + sel.width + PLACEMENT_GAP_X, "stays in the column");
    const added = node(`n${i}`, position.x, position.y);
    for (const other of nodes) assert.ok(!overlaps(added, { ...other, x: other.x - COLLISION_PAD / 2, y: other.y - COLLISION_PAD / 2, width: other.width + COLLISION_PAD, height: other.height + COLLISION_PAD }), `n${i} collides with ${other.id}`);
    nodes.push(added);
    placed.push(position.y);
  }
  assert.equal(new Set(placed).size, 6, "six distinct rows");
});

test("without a selection nodes spiral out from the centre and never overlap", () => {
  const nodes = [];
  for (let i = 0; i < 25; i += 1) {
    const { position, anchored } = planPlacement({ nodes, center: { x: 600, y: 400 } });
    assert.equal(anchored, false);
    const added = node(`n${i}`, position.x, position.y);
    assert.ok(nodes.every((n) => !overlaps(added, n)), `n${i} overlaps`);
    nodes.push(added);
  }
});

test("grid snapping is honoured for the chosen slot", () => {
  const sel = node("a", 13, 7);
  const { position } = planPlacement({ nodes: [sel], selectedNode: sel, grid: 20 });
  assert.equal(position.x % 20, 0);
  assert.equal(position.y % 20, 0);
});

test("viewport visibility accounts for floating chrome, and scrollToReveal fixes an off-screen node", () => {
  const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 1440, height: 900 };
  assert.ok(isRectInView({ x: 400, y: 300, ...NODE_SIZE }, view));
  assert.ok(!isRectInView({ x: 400, y: 20, ...NODE_SIZE }, view), "hidden under the top bar");
  assert.ok(!isRectInView({ x: 400, y: 820, ...NODE_SIZE }, view), "hidden under the dock");
  assert.ok(!isRectInView({ x: 1400, y: 300, ...NODE_SIZE }, view), "off the right edge");
  const far = { x: 2400, y: 1500, ...NODE_SIZE };
  const next = scrollToReveal(far, view);
  assert.ok(isRectInView(far, { ...view, ...next }));
  const zoomed = { ...view, zoom: 0.5 };
  assert.ok(isRectInView(far, { ...zoomed, ...scrollToReveal(far, zoomed) }));
});
