import test from "node:test";
import assert from "node:assert/strict";
import {
  absolutePointsToPatch, dotArrowheadRadius, findPortSnap, getAbsolutePoints, getPortBindingChanges,
  getRoutingMode, getRoutingPatch, getSegmentMidpoints, getShapePorts, insertVertex, isOrthogonalPath,
  moveVertex, normalizeOrthogonalPath, removeVertex, softSnapAngle,
} from "../src/features/canvas/arrowRouting.js";

const rect = { id: "r1", type: "rectangle", x: 100, y: 100, width: 200, height: 100, angle: 0 };
const arrow = (points, extra = {}) => ({ id: "a1", type: "arrow", x: 10, y: 20, width: 0, height: 0, points, ...extra });

test("absolute <-> relative point conversion round-trips", () => {
  const el = arrow([[0, 0], [50, 30], [120, -10]]);
  const abs = getAbsolutePoints(el);
  assert.deepEqual(abs, [{ x: 10, y: 20 }, { x: 60, y: 50 }, { x: 130, y: 10 }]);
  const patch = absolutePointsToPatch(abs);
  assert.deepEqual(patch.points, [[0, 0], [50, 30], [120, -10]]);
  assert.equal(patch.width, 120);
  assert.equal(patch.height, 40);
});

test("soft snap pulls within 3.5deg to 15deg steps and leaves other angles free", () => {
  const from = { x: 0, y: 0 };
  const near45 = softSnapAngle(from, { x: 100, y: 97 });
  assert.equal(near45.snapped, true);
  assert.equal(near45.angle, 45);
  assert.ok(Math.abs(near45.point.x - near45.point.y) < 1e-6);
  const near90 = softSnapAngle(from, { x: 3, y: 100 });
  assert.equal(near90.angle, 90);
  assert.equal(near90.point.x, 0);
  const free = softSnapAngle(from, { x: 100, y: 60 }); // ~31deg, 1deg off 30 -> snaps; use 37deg
  assert.equal(free.snapped, true);
  const reallyFree = softSnapAngle(from, { x: 100, y: 75 }); // ~36.9deg
  assert.equal(reallyFree.snapped, false);
  assert.deepEqual(reallyFree.point, { x: 100, y: 75 });
});

test("soft snap preserves length and is bypassed with Alt (disabled)", () => {
  const to = { x: 100, y: 97 };
  const snapped = softSnapAngle({ x: 0, y: 0 }, to);
  assert.ok(Math.abs(Math.hypot(snapped.point.x, snapped.point.y) - Math.hypot(to.x, to.y)) < 1e-6);
  assert.equal(softSnapAngle({ x: 0, y: 0 }, to, { disabled: true }).snapped, false);
});

test("angles cover the full 0-360 range", () => {
  assert.equal(softSnapAngle({ x: 0, y: 0 }, { x: -100, y: 0 }).angle, 180);
  assert.equal(softSnapAngle({ x: 0, y: 0 }, { x: 0, y: -100 }).angle, 270);
});

test("shapes expose top/right/bottom/left ports", () => {
  const ports = getShapePorts(rect);
  assert.deepEqual(ports.map((p) => [p.side, p.x, p.y]), [["top", 200, 100], ["right", 300, 150], ["bottom", 200, 200], ["left", 100, 150]]);
  assert.deepEqual(getShapePorts({ ...rect, type: "text" }), []);
});

test("port snap uses a 14 screen-px zone that scales with zoom", () => {
  assert.equal(findPortSnap({ x: 200, y: 90 }, [rect])?.side, "top");           // 10px away
  assert.equal(findPortSnap({ x: 200, y: 80 }, [rect]), null);                   // 20px away
  assert.equal(findPortSnap({ x: 200, y: 80 }, [rect], { zoom: 0.5 })?.side, "top"); // 20 scene px = 10 screen px
  assert.equal(findPortSnap({ x: 200, y: 90 }, [rect], { excludeIds: ["r1"] }), null);
});

test("midpoint handles only appear on segments longer than 28 screen px", () => {
  const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 120, y: 0 }];
  const mids = getSegmentMidpoints(pts);
  assert.deepEqual(mids, [{ segmentIndex: 1, x: 70, y: 0 }]);
  assert.equal(getSegmentMidpoints(pts, { zoom: 2 }).length, 2);
});

test("insert, move and remove vertices", () => {
  let pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  pts = insertVertex(pts, 0, { x: 50, y: 0 });
  assert.equal(pts.length, 3);
  pts = moveVertex(pts, 1, { x: 50, y: 40 });
  assert.deepEqual(pts[1], { x: 50, y: 40 });
  assert.equal(removeVertex(pts, 0), pts);           // endpoints are protected
  assert.equal(removeVertex(pts, 2), pts);
  assert.deepEqual(removeVertex(pts, 1), [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  assert.equal(removeVertex(two, 1), two);
});

test("orthogonal normalisation produces only axis-aligned segments and keeps endpoints", () => {
  const input = [{ x: 0, y: 0 }, { x: 80, y: 40 }, { x: 200, y: 90 }];
  const out = normalizeOrthogonalPath(input);
  assert.equal(isOrthogonalPath(out), true);
  assert.deepEqual(out[0], input[0]);
  assert.deepEqual(out[out.length - 1], input[2]);
  // (80,40) lies on the vertical run x=80, so it is merged as a collinear point.
  assert.deepEqual(out, [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 90 }, { x: 200, y: 90 }]);
  assert.equal(isOrthogonalPath(input), false);
});

test("orthogonal normalisation removes duplicate and collinear points", () => {
  const out = normalizeOrthogonalPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }]);
  assert.deepEqual(out, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }]);
});

test("routing modes: polyline keeps every waypoint, curve adds a spline, elbow is orthogonal", () => {
  const el = arrow([[0, 0], [60, 40], [150, 10]]);
  assert.equal(getRoutingMode(el), "polyline");
  const poly = getRoutingPatch(el, "polyline");
  assert.equal(poly.elbowed, false);
  assert.equal(poly.roundness, null);
  assert.equal(poly.points.length, 3);
  const curve = getRoutingPatch(el, "curve");
  assert.deepEqual(curve.roundness, { type: 2 });
  assert.equal(curve.points.length, 3);
  assert.equal(getRoutingMode({ ...el, ...curve }), "curve");
  const elbow = getRoutingPatch(el, "elbow");
  assert.equal(elbow.elbowed, true);
  assert.equal(isOrthogonalPath(getAbsolutePoints({ ...el, ...elbow })), true);
  assert.equal(getRoutingMode({ ...el, ...elbow }), "elbow");
});

test("curve on a straight 2-point arrow adds a bend; lines never become elbowed", () => {
  const curve = getRoutingPatch(arrow([[0, 0], [100, 0]]), "curve");
  assert.equal(curve.points.length, 3);
  const line = { id: "l", type: "line", x: 0, y: 0, points: [[0, 0], [10, 10]] };
  assert.equal("elbowed" in getRoutingPatch(line, "polyline"), false);
  assert.equal("elbowed" in getRoutingPatch(line, "elbow"), false);
});

test("switching modes is reversible without losing waypoints", () => {
  const el = arrow([[0, 0], [60, 40], [150, 10]]);
  const curved = { ...el, ...getRoutingPatch(el, "curve") };
  const back = { ...curved, ...getRoutingPatch(curved, "polyline") };
  assert.deepEqual(back.points, el.points);
});

test("dot arrowhead radius is max(4, strokeWidth * 2)", () => {
  assert.equal(dotArrowheadRadius(1), 4);
  assert.equal(dotArrowheadRadius(2), 4);
  assert.equal(dotArrowheadRadius(4), 8);
});

test("port binding updates arrow and shape bookkeeping", () => {
  const port = getShapePorts(rect)[1];
  const a = { id: "a1", type: "arrow", endBinding: null };
  const first = getPortBindingChanges(a, "end", port, [rect]);
  assert.deepEqual(first.arrowPatch.endBinding, { elementId: "r1", focus: 0, gap: 0 });
  assert.deepEqual(first.shapeUpdates.get("r1"), [{ id: "a1", type: "arrow" }]);
  const bound = { ...a, endBinding: first.arrowPatch.endBinding };
  const shape = { ...rect, boundElements: [{ id: "a1", type: "arrow" }] };
  const cleared = getPortBindingChanges(bound, "end", null, [shape]);
  assert.equal(cleared.arrowPatch.endBinding, null);
  assert.deepEqual(cleared.shapeUpdates.get("r1"), []);
});

/* ---------- wiring checks (source-level, like the other UI tests) ---------- */
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("canvas mounts the arrow vertex editor", () => {
  const canvas = read("src/components/app/SketchiziCanvas.jsx");
  assert.match(canvas, /import ArrowVertexEditor from "\.\/ArrowVertexEditor"/);
  assert.match(canvas, /<ArrowVertexEditor apiRef=\{apiRef\}/);
});

test("vertex editor wires midpoint pull-out, bend deletion, port snap and Alt bypass", () => {
  const editor = read("src/components/app/ArrowVertexEditor.jsx");
  assert.match(editor, /insertVertex\(points, segmentIndex, mid\)/);
  assert.match(editor, /beginDrag\(event, element\.id, segmentIndex \+ 1, true\)/);
  assert.match(editor, /onDoubleClick=/);
  assert.match(editor, /event\.altKey/);
  assert.match(editor, /disabled: event\.altKey/);
  assert.match(editor, /resolveSmartBinding/);
  assert.match(editor, /CaptureUpdateAction\.IMMEDIATELY/);
});

test("Escape commits an in-progress multi-point arrow instead of switching tools", () => {
  const escape = read("src/features/navigation/useSketchiziEscape.js");
  assert.match(escape, /drawingState\?\.multiElement \|\| drawingState\?\.newElement\) return;/);
});

test("dock routing keeps waypoints of multi-point arrows", () => {
  const dock = read("src/components/app/ToolOptionsDock.jsx");
  assert.match(dock, /element\.points\.length > 2\) return applyWaypointGeometryStyle/);
});

test("dot arrowheads are stored as the circle value Excalidraw renders as a filled dot", async () => {
  const { toCanvasArrowhead } = await import("../src/features/canvas/arrowheads.js");
  assert.equal(toCanvasArrowhead("dot"), "circle");
  const toolbar = read("src/components/app/ContextualFormattingToolbar.jsx");
  assert.match(toolbar, /currentItemStartArrowhead = patch\.startArrowhead/);
  assert.match(toolbar, /currentItemEndArrowhead = patch\.endArrowhead/);
});
