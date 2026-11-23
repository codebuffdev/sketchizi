import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_KEY, createEdgeSkeleton, createNodeSkeleton, deserializeSystemDesign, edgePatch, hasSystemDesignContent, metaPatch, readGraph, readNode, serializeSystemDesign } from "../sceneModel.js";
import { isOrthogonal } from "../orthogonalRouter.js";
import { computeAutoLayout } from "../autoLayout.js";
import { createSceneStore } from "../sceneStore.js";

const asElement = (skeleton, id) => ({ id, isDeleted: false, version: 1, ...skeleton });
function scene() {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "a");
  const b = asElement(createNodeSkeleton("redis", { x: 400, y: 0 }, { cacheHitRate: 0.8, replicas: 4 }), "b");
  const e = asElement(createEdgeSkeleton(readNode(a), readNode(b), { protocol: "RESP" }), "e");
  return [a, b, e];
}

test("nodes and edges round-trip through plain Excalidraw element customData", () => {
  const elements = scene();
  const { nodes, edges } = readGraph(elements);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[1].replicas, 4);
  assert.equal(nodes[1].cacheHitRate, 0.8);
  assert.deepEqual([edges[0].from, edges[0].to, edges[0].protocol], ["a", "b", "RESP"]);
  assert.ok(hasSystemDesignContent(elements));
  assert.ok(!hasSystemDesignContent([{ id: "x", type: "rectangle", customData: {} }]));
});

test("IndexedDB serialization survives a JSON round-trip (structured-clone safe)", () => {
  const elements = scene();
  const restoredElements = JSON.parse(JSON.stringify(elements)); // what the persistence layer stores
  assert.deepEqual(readGraph(restoredElements), readGraph(elements));
  const payload = serializeSystemDesign(elements);
  const back = deserializeSystemDesign(payload);
  assert.equal(back.nodes.length, 2);
  assert.equal(back.edges[0].id, "e");
  assert.throws(() => deserializeSystemDesign({ version: 99 }));
});

test("corrupt metadata is sanitised, never trusted", () => {
  const el = asElement(createNodeSkeleton("microservice", { x: 0, y: 0 }), "n");
  el.customData[CUSTOM_KEY].meta = { kind: "microservice", replicas: -4, cacheHitRate: 9, accent: "purple", protocol: "FTP", port: "x", label: "  " };
  const node = readNode(el);
  assert.equal(node.replicas, 0);
  assert.equal(node.cacheHitRate, 1);
  assert.equal(node.accent, "emerald");
  assert.equal(node.protocol, "gRPC");
  assert.equal(node.label, "Microservice");
  el.customData[CUSTOM_KEY].meta = { kind: "bogus" };
  assert.equal(readNode(el), null);
});

test("edges to deleted nodes are dropped; edge geometry is orthogonal", () => {
  const [a, b, e] = scene();
  assert.equal(readGraph([a, { ...b, isDeleted: true }, e]).edges.length, 0);
  const pts = e.points.map(([x, y]) => ({ x, y }));
  assert.ok(isOrthogonal(pts));
});

test("patches merge into customData without losing role", () => {
  const [a, , e] = scene();
  const next = { ...a, ...metaPatch(a, { replicas: 9 }) };
  assert.equal(readNode(next).replicas, 9);
  assert.equal(next.customData[CUSTOM_KEY].role, "node");
  assert.equal(readGraph([next, scene()[1], { ...e, ...edgePatch(e, { lineStyle: "dashed" }) }]).edges[0].lineStyle, "dashed");
});

test("auto-layout places entries left, downstream to the right, on the grid", () => {
  const nodes = ["client", "api-gateway", "microservice", "sql"].map((kind, i) => readNode(asElement(createNodeSkeleton(kind, { x: 7 * i, y: 3 }), `n${i}`)));
  const edges = [["n0", "n1"], ["n1", "n2"], ["n2", "n3"]].map(([from, to], i) => ({ id: `e${i}`, from, to }));
  const pos = computeAutoLayout(nodes, edges, { grid: 20 });
  assert.ok(pos.get("n0").x < pos.get("n1").x && pos.get("n1").x < pos.get("n2").x && pos.get("n2").x < pos.get("n3").x);
  for (const p of pos.values()) { assert.equal(p.x % 20, 0); assert.equal(p.y % 20, 0); }
  const cyc = computeAutoLayout(nodes, [...edges, { id: "back", from: "n3", to: "n1" }]);
  assert.equal(cyc.size, 4);
});

test("scene store notifies subscribers and bumps revision", () => {
  const store = createSceneStore();
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.set({ elements: [], selectedIds: [] });
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().revision, 1);
  off();
  store.set({ elements: [], selectedIds: [] });
  assert.equal(calls, 1);
});
