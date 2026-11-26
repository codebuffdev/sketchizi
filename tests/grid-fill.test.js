import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStylePatch, getFillStyle, getGridFill, gridLines, drawGridFill, paintGridFills, stripGridKeys,
} from "../src/features/canvas/gridFill.js";

class FakePath { constructor() { this.ops = []; } rect(...a) { this.ops.push(["rect", ...a]); } roundRect(...a) { this.ops.push(["roundRect", ...a]); }
  ellipse(...a) { this.ops.push(["ellipse", ...a]); } moveTo() {} lineTo() {} closePath() {} }
globalThis.Path2D = FakePath;
const recorder = () => { const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => calls.push([k, ...a])), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); return ctx; };

const rect = (extra = {}) => ({ id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 60, strokeColor: "#111", backgroundColor: "#ff0000", fillStyle: "hachure", roughness: 0, seed: 7, opacity: 100, angle: 0, ...extra });

test("selecting Grid moves the fill color into gridFill and reports 'grid'", () => {
  const next = applyStylePatch(rect(), { fillStyle: "grid" });
  assert.equal(getFillStyle(next), "grid");
  assert.equal(next.fillStyle, "solid");
  assert.equal(next.backgroundColor, "transparent");
  assert.deepEqual(getGridFill(next), { color: "#ff0000", gap: 24, weight: 1.5 });
});

test("recolor, density and weight only touch the grid; leaving grid restores fill", () => {
  const g = applyStylePatch(rect(), { fillStyle: "grid" });
  const recolored = applyStylePatch(g, { backgroundColor: "#00ff00" });
  assert.equal(getGridFill(recolored).color, "#00ff00");
  assert.equal(recolored.backgroundColor, "transparent");
  const dense = applyStylePatch(recolored, { gridGap: 4, gridWeight: 9 });
  assert.equal(getGridFill(dense).gap, 12); // clamped 12..48
  assert.equal(getGridFill(dense).weight, 3); // clamped 1..3
  assert.equal(dense.gridGap, undefined);
  const back = applyStylePatch(dense, { fillStyle: "cross-hatch" });
  assert.equal(getGridFill(back), null);
  assert.equal(back.fillStyle, "cross-hatch");
  assert.equal(back.backgroundColor, "#00ff00");
});

test("gap/weight patches leave hachure and cross-hatch fills untouched", () => {
  const h = rect({ fillStyle: "cross-hatch" });
  const out = applyStylePatch(h, { gridGap: 40, gridWeight: 3 });
  assert.equal(out.fillStyle, "cross-hatch");
  assert.equal(out.backgroundColor, "#ff0000");
  assert.equal(out.customData, undefined);
  assert.deepEqual(stripGridKeys({ fillStyle: "grid", gridGap: 3, opacity: 50 }), { opacity: 50 });
});

test("grid lines step by gap inside bounds; crisp at roughness 0, jittered otherwise", () => {
  const lines = gridLines(rect(), { gap: 20, roughness: 0, seed: 1 });
  const h = lines.filter((l) => l.y1 === l.y2).map((l) => l.y1);
  const v = lines.filter((l) => l.x1 === l.x2).map((l) => l.x1);
  assert.deepEqual(h, [40, 60, 80]); // y+gap .. y+height (20+60=80)
  assert.deepEqual(v, [30, 50, 70, 90, 110]); // x+gap .. x+width (110)
  const rough = gridLines(rect(), { gap: 20, roughness: 1, seed: 1 });
  assert.notDeepEqual(rough.map((l) => l.y1), lines.map((l) => l.y1));
  assert.deepEqual(rough, gridLines(rect(), { gap: 20, roughness: 1, seed: 1 })); // stable across repaints
});

test("drawGridFill clips, strokes with fill color/weight, and restores", () => {
  const ctx = recorder();
  drawGridFill(ctx, applyStylePatch(rect(), { fillStyle: "grid", gridWeight: 2 }));
  const names = ctx.calls.map((c) => c[0]);
  assert.equal(names[0], "save");
  assert.ok(names.indexOf("clip") < names.indexOf("stroke"));
  assert.equal(names.at(-1), "restore");
  assert.ok(ctx.calls.some((c) => c[0] === "set:strokeStyle" && c[1] === "#ff0000"));
  assert.ok(ctx.calls.some((c) => c[0] === "set:lineWidth" && c[1] === 2));
});

test("non-grid shapes are not painted; text above a grid is knocked out", () => {
  const plain = recorder();
  paintGridFills(plain, [rect()]);
  assert.equal(plain.calls.length, 0);
  const grid = applyStylePatch(rect(), { fillStyle: "grid" });
  const text = { id: "t", type: "text", x: 20, y: 30, width: 40, height: 20, angle: 0 };
  const ctx = recorder();
  paintGridFills(ctx, [grid, text]);
  assert.ok(ctx.calls.some((c) => c[0] === "set:globalCompositeOperation" && c[1] === "destination-out"));
});
