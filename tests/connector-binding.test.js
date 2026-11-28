import test from "node:test";
import assert from "node:assert/strict";
import {
  anchorFromBinding, applyReconcile, createConnectorMemory, getBindingChanges, getConnectionPorts, makeBinding,
  normalizeBounds, projectOntoBorder, readConnectorBindings, recomputeBoundConnector, reconcileConnectors,
  remapConnectorBindingIds, resolveSmartBinding,
} from "../src/features/canvas/connectorBinding.js";

const box = (id, x, y, w, h, extra = {}) => ({ id, type: "rectangle", x, y, width: w, height: h, angle: 0, backgroundColor: "transparent", ...extra });
const conn = (type, id, a, b, extra = {}) => ({
  id, type, x: a.x, y: a.y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), angle: 0,
  points: [[0, 0], [b.x - a.x, b.y - a.y]], ...extra,
});
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

const A = box("A", 0, 0, 200, 100);
const B = box("B", 500, 40, 160, 220); // different height

test("bounds are normalised for right-to-left / bottom-to-top shapes", () => {
  const flipped = box("F", 300, 200, -200, -100);
  assert.deepEqual(normalizeBounds(flipped), { minX: 100, minY: 100, maxX: 300, maxY: 200, width: 200, height: 100, cx: 200, cy: 150 });
  assert.equal(normalizeBounds(box("Z", 0, 0, 0, 50)), null);
  const snap = resolveSmartBinding({ x: 200, y: 150 }, [flipped]); // inside, unfilled -> needs the border
  assert.equal(snap, null);
  const edge = resolveSmartBinding({ x: 302, y: 150 }, [flipped]);
  assert.equal(edge.side, "right");
  near(edge.x, 300); near(edge.y, 150);
});

test("snap reach scales inversely with zoom: 14 screen px outside the border", () => {
  for (const zoom of [0.5, 1, 2]) {
    const reach = 14 / zoom;
    assert.ok(resolveSmartBinding({ x: 200 + reach - 0.5, y: 50 }, [A], { zoom }), `inside reach @${zoom}`);
    assert.equal(resolveSmartBinding({ x: 200 + reach + 1, y: 50 }, [A], { zoom }), null, `outside reach @${zoom}`);
  }
});

test("port magnet is 16 screen px: snaps onto the exact midpoint, else projects onto the border", () => {
  for (const zoom of [0.5, 1, 2]) {
    const m = 16 / zoom;
    const snapped = resolveSmartBinding({ x: 200 + 2 / zoom, y: 50 + m - 1 }, [A], { zoom });
    assert.equal(snapped.portSnapped, true);
    assert.deepEqual([snapped.x, snapped.y, snapped.side], [200, 50, "right"]);
    const free = resolveSmartBinding({ x: 200 + 2 / zoom, y: 50 + m + 8 / zoom }, [A], { zoom });
    assert.equal(free.portSnapped, false);
    near(free.x, 200); near(free.y, 50 + m + 8 / zoom); // projected straight onto the right border
  }
});

test("zero gap: anchors lie exactly on the border for rect, rounded rect, diamond and ellipse", () => {
  const shapes = [
    A,
    box("R", 0, 0, 200, 100, { roundness: { type: 3 } }),
    { ...box("D", 0, 0, 200, 100), type: "diamond" },
    { ...box("E", 0, 0, 200, 100), type: "ellipse" },
  ];
  for (const shape of shapes) {
    for (const pt of [{ x: 230, y: 20 }, { x: -20, y: 90 }, { x: 100, y: -10 }, { x: 110, y: 120 }, { x: 5, y: 5 }]) {
      const snap = resolveSmartBinding(pt, [shape], { zoom: 0.25 }); // huge reach: always binds
      assert.ok(snap, `${shape.id} @${JSON.stringify(pt)}`);
      near(Math.abs(projectOntoBorder(shape, snap.point).signed), 0, 1e-5);
    }
  }
});

test("ellipse projection hits the true perimeter", () => {
  const e = { ...box("E", -100, -50, 200, 100), type: "ellipse" };
  const p = projectOntoBorder(e, { x: 0, y: 80 });
  near(p.x, 0, 1e-6); near(p.y, 50, 1e-6); near(p.signed, 30, 1e-6);
});

test("rotated shapes bind on the rotated border", () => {
  const r = box("Rot", 0, 0, 200, 100, { angle: Math.PI / 2 }); // centre (100,50): occupies x 50..150, y -50..150
  const snap = resolveSmartBinding({ x: 152, y: 50 }, [r]);
  assert.equal(snap.shapeId, "Rot");
  near(snap.x, 150, 1e-6); near(snap.y, 50, 1e-6);
});

test("Alt / Cmd bypass disables magnetic binding", () => {
  assert.equal(resolveSmartBinding({ x: 201, y: 50 }, [A], { bypass: true }), null);
});

test("unfilled containers only bind at the border; filled shapes bind from inside; frames are border-only", () => {
  const container = box("C", 0, 0, 600, 400);
  const inner = box("I", 100, 100, 100, 60, { backgroundColor: "#fff" });
  assert.equal(resolveSmartBinding({ x: 450, y: 300 }, [container]), null);
  assert.equal(resolveSmartBinding({ x: 150, y: 130 }, [container, inner]).shapeId, "I");
  const frame = { ...box("Fr", 0, 0, 600, 400), type: "frame" };
  assert.equal(resolveSmartBinding({ x: 300, y: 200 }, [frame]), null);
  assert.equal(resolveSmartBinding({ x: 603, y: 200 }, [frame]).shapeId, "Fr");
});

test("code blocks (image + customData.codeBlock) are connectable, plain images are not", () => {
  const code = { ...box("K", 0, 0, 300, 120), type: "image", customData: { codeBlock: {} } };
  const photo = { ...box("P", 0, 0, 300, 120), type: "image" };
  assert.ok(resolveSmartBinding({ x: 302, y: 60 }, [code]));
  assert.equal(resolveSmartBinding({ x: 302, y: 60 }, [photo]), null);
});

test("line and arrow share one pipeline: identical binding and recompute result", () => {
  const snapA = resolveSmartBinding({ x: 203, y: 30 }, [A, B]);
  const snapB = resolveSmartBinding({ x: 497, y: 120 }, [A, B]);
  const line = conn("line", "L", { x: 203, y: 30 }, { x: 497, y: 120 });
  const arrow = conn("arrow", "W", { x: 203, y: 30 }, { x: 497, y: 120 });
  const bind = (c) => {
    let cur = c;
    for (const [which, snap] of [["start", snapA], ["end", snapB]]) cur = { ...cur, ...getBindingChanges(cur, which, snap, [A, B]).patch };
    return cur;
  };
  const L = bind(line); const W = bind(arrow);
  assert.deepEqual(L.startBinding, W.startBinding);
  assert.equal(L.startBinding.gap, 0);
  assert.deepEqual(L.customData.connectorBinding.end, W.endBinding);
  const byId = new Map([A, B].map((s) => [s.id, s]));
  const moved = new Map([[A.id, { ...A, x: 40, y: 200, width: 260, height: 40 }], [B.id, B]]);
  assert.deepEqual(recomputeBoundConnector(L, moved).points, recomputeBoundConnector(W, moved).points);
  assert.ok(recomputeBoundConnector(L, byId));
});

test("binding metadata is structured: side + normalizedOffset, stored for lines in customData too", () => {
  const snap = resolveSmartBinding({ x: 200, y: 50 }, [A]);
  const b = makeBinding(snap);
  assert.deepEqual([b.elementId, b.side, b.normalizedOffset, b.gap], ["A", "right", { x: 1, y: 0.5 }, 0]);
  const stripped = { ...conn("line", "L", { x: 0, y: 0 }, { x: 1, y: 1 }), customData: { connectorBinding: { end: b } } };
  assert.equal(readConnectorBindings(stripped).end.side, "right"); // survives restore stripping top-level fields
});

test("reconcile: resizing / moving a box drags every bound line and arrow with it, flush on the border", () => {
  const memory = createConnectorMemory();
  const snapB = resolveSmartBinding({ x: 497, y: 120 }, [A, B]);
  const snapA = resolveSmartBinding({ x: 203, y: 30 }, [A, B]);
  const make = (type, id) => {
    let c = conn(type, id, { x: 203, y: 30 }, { x: 497, y: 120 });
    for (const [which, snap] of [["start", snapA], ["end", snapB]]) c = { ...c, ...getBindingChanges(c, which, snap, [A, B]).patch };
    return c;
  };
  let scene = [A, B, make("line", "L"), make("arrow", "W")];
  reconcileConnectors(scene, { memory });                       // first pass records memory
  scene = scene.map((el) => (el.id === "B" ? { ...el, x: 700, y: 300, height: 300 } : el)); // move + resize B
  const result = reconcileConnectors(scene, { memory });
  scene = applyReconcile(scene, result);
  for (const id of ["L", "W"]) {
    const c = scene.find((el) => el.id === id);
    const end = { x: c.x + c.points.at(-1)[0], y: c.y + c.points.at(-1)[1] };
    const shape = scene.find((el) => el.id === "B");
    near(projectOntoBorder(shape, end).signed, 0, 1e-6);          // zero gap
    const expected = anchorFromBinding(shape, readConnectorBindings(c).end);
    near(end.x, expected.x, 1e-6); near(end.y, expected.y, 1e-6);
  }
  assert.equal(reconcileConnectors(scene, { memory }).patches.size, 0); // idempotent: no loop
});

test("reconcile: undo restoring the old shape geometry re-glues the connectors", () => {
  const memory = createConnectorMemory();
  const snap = resolveSmartBinding({ x: 203, y: 30 }, [A]);
  let L = conn("line", "L", { x: 203, y: 30 }, { x: 400, y: 30 });
  L = { ...L, ...getBindingChanges(L, "start", snap, [A]).patch };
  let scene = [A, L];
  reconcileConnectors(scene, { memory });
  scene = applyReconcile(scene.map((e) => (e.id === "A" ? { ...e, x: 50 } : e)), reconcileConnectors(scene.map((e) => (e.id === "A" ? { ...e, x: 50 } : e)), { memory }));
  const undone = scene.map((e) => (e.id === "A" ? { ...A } : e));
  scene = applyReconcile(undone, reconcileConnectors(undone, { memory }));
  const line = scene.find((e) => e.id === "L");
  near(line.x, 200, 1e-6);
});

test("reconcile: dragging a bound endpoint away (shape unchanged) unbinds that end only", () => {
  const memory = createConnectorMemory();
  const s = resolveSmartBinding({ x: 203, y: 30 }, [A, B]);
  const e = resolveSmartBinding({ x: 497, y: 120 }, [A, B]);
  let L = conn("line", "L", s.point, e.point); // flush on both borders
  L = { ...L, ...getBindingChanges(L, "start", s, [A, B]).patch };
  L = { ...L, ...getBindingChanges(L, "end", e, [A, B]).patch };
  let scene = [A, B, L];
  reconcileConnectors(scene, { memory });
  const edited = { ...L, points: [[0, 0], [250, 20]], x: L.x, y: L.y }; // end dragged into empty space
  scene = [A, B, edited];
  const result = reconcileConnectors(scene, { memory });
  const patch = result.patches.get("L");
  assert.equal(patch.endBinding, null);
  assert.ok(!("startBinding" in patch)); // start untouched
});

test("reconcile: duplicate remaps a cloned line onto the cloned shape", () => {
  const memory = createConnectorMemory();
  const snap = resolveSmartBinding({ x: 203, y: 30 }, [A]);
  let L = conn("line", "L", snap.point, { x: 400, y: 30 });
  L = { ...L, ...getBindingChanges(L, "start", snap, [A]).patch };
  reconcileConnectors([A, L], { memory });
  const A2 = { ...A, id: "A2", x: A.x + 10, y: A.y + 300 };
  const L2 = { ...L, id: "L2", x: L.x + 10, y: L.y + 300 };       // clone keeps the OLD binding ids
  const scene = [A, L, A2, L2];
  const result = reconcileConnectors(scene, { memory });
  const patch = result.patches.get("L2");
  assert.equal(patch?.startBinding?.elementId, "A2");
  assert.equal(patch.customData.connectorBinding.start.elementId, "A2");
  assert.ok(!result.patches.has("L"));
});

test("reconcile: native Excalidraw bindings with a floating gap are adopted and pulled flush", () => {
  const memory = createConnectorMemory();
  let W = conn("arrow", "W", { x: 208, y: 50 }, { x: 400, y: 50 }); // 8px floating gap
  W = { ...W, startBinding: { elementId: "A", focus: 0, gap: 8 } };
  const scene = [{ ...A, boundElements: [{ id: "W", type: "arrow" }] }, W];
  reconcileConnectors(scene, { memory });
  const result = reconcileConnectors(scene, { memory });
  const patch = result.patches.get("W");
  assert.equal(patch.startBinding.gap, 0);
  assert.equal(patch.startBinding.side, "right");
  near(patch.x, 200, 1e-6);
});

test("remapConnectorBindingIds rewrites top-level and mirrored bindings", () => {
  const el = { startBinding: { elementId: "A" }, customData: { connectorBinding: { start: { elementId: "A" }, end: { elementId: "B" } } } };
  remapConnectorBindingIds(el, new Map([["A", "A9"], ["B", "B9"]]));
  assert.equal(el.startBinding.elementId, "A9");
  assert.equal(el.customData.connectorBinding.end.elementId, "B9");
});

test("ports expose four cardinal midpoints", () => {
  assert.deepEqual(getConnectionPorts(A).map((p) => [p.side, p.x, p.y]), [["top", 100, 0], ["right", 200, 50], ["bottom", 100, 100], ["left", 0, 50]]);
});

/* ---------- wiring checks ---------- */
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("editor drives line AND arrow through resolveSmartBinding with Alt/Cmd bypass and live feedback", () => {
  const editor = read("src/components/app/ArrowVertexEditor.jsx");
  assert.doesNotMatch(editor, /findPortSnap|target\.type === "arrow"|element\.type === "arrow" && isEnd/);
  assert.match(editor, /event\.altKey \|\| event\.metaKey/);
  assert.match(editor, /sk-arrow-anchor-ring/);
  assert.match(editor, /TargetOutline/);
  const css = read("src/components/app/ArrowVertexEditor.css");
  assert.match(css, /#4f46e5/);
  assert.match(css, /rgb\(79 70 229 \/ 25%\)/);
});

test("canvas reconciles bound connectors inside the scene-change hook with NEVER capture", () => {
  const canvas = read("src/components/app/SketchiziCanvas.jsx");
  assert.match(canvas, /reconcileConnectors\(elements/);
  assert.match(canvas, /captureUpdate: "NEVER"/);
});

test("no connector creator hardcodes a floating binding gap", () => {
  assert.doesNotMatch(read("src/App.jsx"), /gap: 8/);
  assert.doesNotMatch(read("src/features/design/templates/templateScene.js"), /gap: 1 \}/);
});
