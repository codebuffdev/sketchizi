import test from "node:test";
import assert from "node:assert/strict";
import { findComponentPlacement } from "../src/features/workbench/componentPlacement.js";

const container = (id, x, y, viewId = "system", extra = {}) => ({
  id, x, y, width: 240, height: 96, ...extra,
  customData: { workbench: { entityId: id, role: "container", viewId } },
});

test("component placement starts at the requested center when the canvas area is clear", () => {
  assert.deepEqual(findComponentPlacement({ x: 500, y: 300 }, [], "system"), { x: 380, y: 252, width: 240, height: 96 });
});

test("component placement finds a non-overlapping nearby slot deterministically", () => {
  const center = { x: 500, y: 300 };
  const existing = [container("one", 380, 252)];
  const first = findComponentPlacement(center, existing, "system");
  const second = findComponentPlacement(center, existing, "system");
  assert.deepEqual(first, second);
  assert.ok(first.x >= 648 || first.x + first.width <= 352 || first.y >= 376 || first.y + first.height <= 224);
});

test("placement ignores deleted containers and containers from inactive views", () => {
  const center = { x: 500, y: 300 };
  const existing = [
    container("deleted", 380, 252, "system", { isDeleted: true }),
    container("inactive", 380, 252, "lld"),
  ];
  assert.deepEqual(findComponentPlacement(center, existing, "system"), { x: 380, y: 252, width: 240, height: 96 });
});

test("placement skips non-container visual elements", () => {
  const existing = [{ id: "label", x: 380, y: 252, width: 240, height: 96, customData: { workbench: { role: "label", viewId: "system" } } }];
  assert.deepEqual(findComponentPlacement({ x: 500, y: 300 }, existing, "system"), { x: 380, y: 252, width: 240, height: 96 });
});
