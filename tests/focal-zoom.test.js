import test from "node:test";
import assert from "node:assert/strict";
import { computeFocalCamera } from "../src/features/canvas/focalZoom.js";

const screenOf = (p, c) => ({ x: (p.x + c.scrollX) * c.zoom, y: (p.y + c.scrollY) * c.zoom });
const base = { width: 1000, height: 800, scrollX: 0, scrollY: 0, zoom: 1 };

test("focus stays locked under its on-screen position when zooming", () => {
  const focus = { x: 700, y: 300 };
  const cam = computeFocalCamera({ ...base, focus, nextZoom: 2 });
  assert.deepEqual(screenOf(focus, cam), { x: 700, y: 300 });
});

test("off-screen focus is pulled back inside the 64px margin", () => {
  const focus = { x: 1500, y: -200 };
  const cam = computeFocalCamera({ ...base, focus, nextZoom: 1.2 });
  const screen = screenOf(focus, cam);
  assert.ok(Math.abs(screen.x - 936) < 1e-9 && Math.abs(screen.y - 64) < 1e-9);
});

test("zoom is clamped to bounds", () => {
  assert.equal(computeFocalCamera({ ...base, focus: { x: 0, y: 0 }, nextZoom: 99 }).zoom, 8);
  assert.equal(computeFocalCamera({ ...base, focus: { x: 0, y: 0 }, nextZoom: 0.001 }).zoom, 0.1);
});
