import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_KEY, collectSceneRepairs, createEdgeSkeleton, createNodeSkeleton, deserializeSystemDesign, edgePatch, hasSystemDesignContent, metaPatch, readGraph, readNode, serializeSystemDesign } from "../sceneModel.js";
import { isOrthogonal } from "../orthogonalRouter.js";
import { computeAutoLayout } from "../autoLayout.js";
import { createSceneStore } from "../sceneStore.js";
import { BLUEPRINTS } from "../blueprints.js";

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

test("native shapes are invisible hit-targets (single visual contract) with a solid fill so the interior is draggable", () => {
  const node = createNodeSkeleton("sql", { x: 0, y: 0 });
  assert.equal(node.opacity, 0);
  assert.equal(node.fillStyle, "solid");
  assert.notEqual(node.backgroundColor, "transparent");
  const edge = createEdgeSkeleton({ id: "a", x: 0, y: 0, width: 200, height: 84, protocol: "SQL" }, { id: "b", x: 420, y: 0, width: 200, height: 84 });
  assert.equal(edge.opacity, 0);
  assert.equal(edge.strokeColor, "transparent");
  assert.equal(edge.startArrowhead, null);
  assert.equal(edge.endArrowhead, null);
});

test("collectSceneRepairs upgrades first-iteration elements, rotates nodes back, drops ghost connectors, and is idempotent", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "a");
  const b = asElement(createNodeSkeleton("redis", { x: 400, y: 0 }), "b");
  const ok = asElement(createEdgeSkeleton(readNode(a), readNode(b), {}), "ok");
  const ghost = asElement(createEdgeSkeleton(readNode(a), { ...readNode(b), id: "gone" }, {}), "ghost");
  Object.assign(a, { opacity: 100, backgroundColor: "#f8fafc", angle: 0.7 }); // legacy visible + rotated
  Object.assign(ok, { opacity: 100 });
  const repairs = collectSceneRepairs([a, b, ok, ghost]);
  assert.deepEqual(repairs.get("a"), { opacity: 0, angle: 0 });
  assert.equal(repairs.has("b"), false);
  assert.deepEqual(repairs.get("ok"), { opacity: 0 });
  assert.deepEqual(repairs.get("ghost"), { isDeleted: true });
  const applied = [a, b, ok, ghost].map((el) => ({ ...el, ...(repairs.get(el.id) || {}) }));
  assert.equal(collectSceneRepairs(applied).size, 0, "second pass finds nothing");
});

test("readGraph resolves Excalidraw arrow bindings even without stored from/to metadata", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "client");
  const b = asElement(createNodeSkeleton("microservice", { x: 400, y: 0 }), "orders");
  const arrow = {
    id: "bound-arrow", type: "arrow", x: 200, y: 42, points: [[0, 0], [200, 0]],
    startBinding: { elementId: "client" }, endBinding: { elementId: "orders" },
    customData: { [CUSTOM_KEY]: { role: "edge", protocol: "gRPC" } },
  };
  const graph = readGraph([a, b, arrow]);
  assert.deepEqual([graph.edges[0].from, graph.edges[0].to], ["client", "orders"]);
});

test("readGraph falls back to arrow endpoint proximity within 24 scene pixels", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "client");
  const b = asElement(createNodeSkeleton("microservice", { x: 400, y: 0 }), "orders");
  const arrow = {
    id: "near-arrow", type: "arrow", x: 198, y: 42, points: [[0, 0], [202, 0]],
    customData: { [CUSTOM_KEY]: { role: "edge", protocol: "HTTPS" } },
  };
  const graph = readGraph([a, b, arrow]);
  assert.deepEqual([graph.edges[0].from, graph.edges[0].to], ["client", "orders"]);
});


test("readGraph exposes only one visual connector for duplicate source-target pairs", () => {
  const [a, b, first] = scene();
  const duplicate = asElement(createEdgeSkeleton(readNode(a), readNode(b), { protocol: "HTTPS" }), "duplicate");
  const graph = readGraph([a, b, first, duplicate]);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].id, "e");
});

test("collectSceneRepairs hides native arrow strokes and deletes duplicate connectors", () => {
  const [a, b, first] = scene();
  Object.assign(first, { opacity: 100, strokeColor: "#000000", endArrowhead: "arrow" });
  const duplicate = asElement(createEdgeSkeleton(readNode(a), readNode(b), {}), "duplicate");
  Object.assign(duplicate, { opacity: 100, strokeColor: "#111111" });
  const repairs = collectSceneRepairs([a, b, first, duplicate]);
  assert.deepEqual(repairs.get("e"), {
    opacity: 0, strokeColor: "transparent", endArrowhead: null,
  });
  assert.deepEqual(repairs.get("duplicate"), { isDeleted: true });
});


test("scene repair keeps binding-resolved arrows and persists their endpoint metadata", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "client");
  const b = asElement(createNodeSkeleton("microservice", { x: 400, y: 0 }), "orders");
  const arrow = {
    id: "bound-arrow", type: "arrow", opacity: 100, strokeColor: "#000000",
    x: 200, y: 42, points: [[0, 0], [200, 0]],
    startBinding: { elementId: "client" }, endBinding: { elementId: "orders" },
    customData: { [CUSTOM_KEY]: { role: "edge", protocol: "gRPC" } },
  };
  const patch = collectSceneRepairs([a, b, arrow]).get("bound-arrow");
  assert.equal(patch.opacity, 0);
  assert.equal(patch.strokeColor, "transparent");
  assert.deepEqual(patch.customData[CUSTOM_KEY], {
    role: "edge", protocol: "gRPC", from: "client", to: "orders",
  });
});


test("legacy native arrows between System Design nodes normalize into hidden graph edges", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "client");
  const b = asElement(createNodeSkeleton("microservice", { x: 400, y: 0 }), "orders");
  const native = {
    id: "legacy-native-arrow", type: "arrow", x: 200, y: 42, width: 200, height: 0,
    points: [[0, 0], [200, 0]], opacity: 100, strokeColor: "#000000",
    startBinding: { elementId: "client" }, endBinding: { elementId: "orders" },
    endArrowhead: "arrow",
  };
  const graph = readGraph([a, b, native]);
  assert.deepEqual([graph.edges.length, graph.edges[0].from, graph.edges[0].to], [1, "client", "orders"]);
  const repair = collectSceneRepairs([a, b, native]).get(native.id);
  assert.equal(repair.opacity, 0);
  assert.equal(repair.strokeColor, "transparent");
  assert.equal(repair.endArrowhead, null);
  assert.deepEqual(
    { role: repair.customData[CUSTOM_KEY].role, from: repair.customData[CUSTOM_KEY].from, to: repair.customData[CUSTOM_KEY].to },
    { role: "edge", from: "client", to: "orders" },
  );
  const migrated = { ...native, ...repair };
  assert.equal(readGraph([a, b, migrated]).edges.length, 1);
  assert.equal(collectSceneRepairs([a, b, migrated]).size, 0);
});

test("unrelated native canvas arrows are not imported into the System Design graph", () => {
  const a = asElement(createNodeSkeleton("client", { x: 0, y: 0 }), "client");
  const b = asElement(createNodeSkeleton("microservice", { x: 400, y: 0 }), "orders");
  const unrelated = { id: "plain-arrow", type: "arrow", x: 0, y: 300, points: [[0, 0], [100, 100]] };
  assert.equal(readGraph([a, b, unrelated]).edges.length, 0);
  assert.equal(collectSceneRepairs([a, b, unrelated]).has(unrelated.id), false);
});

test("every blueprint edge is materialized with the exact generated System Design node IDs", () => {
  for (const blueprint of BLUEPRINTS) {
    const ids = new Map(blueprint.nodes.map((node) => [node.key, `node-${node.key}`]));
    const nodes = blueprint.nodes.map((node) => asElement(
      createNodeSkeleton(node.kind, { x: node.at[0] * 300, y: node.at[1] * 130 }, node.overrides || {}, ids.get(node.key)),
      ids.get(node.key),
    ));
    const rects = new Map(nodes.map((element) => [element.id, readNode(element)]));
    const edges = blueprint.edges.map((edge, index) => asElement(
      createEdgeSkeleton(rects.get(ids.get(edge.from)), rects.get(ids.get(edge.to)), edge.protocol ? { protocol: edge.protocol } : {}, `edge-${index}`),
      `edge-${index}`,
    ));
    const graph = readGraph([...nodes, ...edges]);
    assert.equal(graph.nodes.length, blueprint.nodes.length, blueprint.id);
    assert.equal(graph.edges.length, blueprint.edges.length, blueprint.id);
    for (const edge of blueprint.edges) {
      assert.ok(graph.edges.some((actual) => actual.from === ids.get(edge.from) && actual.to === ids.get(edge.to)), blueprint.id);
    }
  }
});
