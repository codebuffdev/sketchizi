import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLUEPRINTS, getBlueprint } from "../blueprints.js";
import { createNodeMeta } from "../primitives.js";
import { simulateTraffic } from "../trafficSimulator.js";
import { k8sKind, imageTag, kubernetesYaml, nodeFacets, serviceNames } from "../yamlPreview.js";

const n = (id, kind, extra = {}) => ({ id, ...createNodeMeta(kind), ...extra });
const e = (from, to) => ({ id: `${from}-${to}`, from, to, protocol: "gRPC" });

test("a dropped Load Balancer -> Microservice simulates 10k RPS with no Client present", () => {
  const r = simulateTraffic({ nodes: [n("lb", "load-balancer"), n("svc", "microservice", { replicas: 10 })], edges: [e("lb", "svc")], totalRps: 10000 });
  assert.equal(r.nodes.lb.incomingRps, 10000);
  assert.equal(r.nodes.svc.incomingRps, 10000);
  assert.equal(r.edges["lb-svc"].rps, 10000);
});

test("any root node is a traffic source when nothing ingress-like exists; Client roots still win", () => {
  const solo = simulateTraffic({ nodes: [n("a", "microservice"), n("db", "sql")], edges: [e("a", "db")], totalRps: 500 });
  assert.equal(solo.nodes.a.incomingRps, 500);
  const withClient = simulateTraffic({ nodes: [n("c", "client"), n("lb", "load-balancer"), n("s", "microservice")], edges: [e("c", "lb"), e("lb", "s")], totalRps: 1000 });
  assert.equal(withClient.nodes.c.incomingRps, 1000);
  assert.equal(withClient.nodes.lb.incomingRps, 1000);
  assert.equal(simulateTraffic({ nodes: [], edges: [], totalRps: 1000 }).totalRps, 1000); // empty canvas never throws
});

test("every blueprint is a valid, fully connected graph that runs healthy at the default 10k RPS", () => {
  assert.deepEqual(BLUEPRINTS.map((b) => b.label), ["Read-Heavy Web Scale", "Event-Driven Order Pipeline", "Load-Balanced Microservices"]);
  for (const bp of BLUEPRINTS) {
    assert.equal(getBlueprint(bp.id), bp);
    const keys = new Set(bp.nodes.map((x) => x.key));
    assert.equal(keys.size, bp.nodes.length);
    for (const edge of bp.edges) assert.ok(keys.has(edge.from) && keys.has(edge.to), `${bp.id}: dangling edge`);
    const nodes = bp.nodes.map((x) => n(x.key, x.kind, x.overrides || {}));
    const edges = bp.edges.map((x) => ({ id: `${x.from}-${x.to}`, from: x.from, to: x.to, protocol: x.protocol || "HTTPS" }));
    const sim = simulateTraffic({ nodes, edges, totalRps: 10000 });
    for (const node of nodes) {
      assert.ok(sim.nodes[node.key ?? node.id].incomingRps > 0, `${bp.id}: ${node.id} gets no traffic`);
      assert.equal(sim.nodes[node.id].status, "healthy", `${bp.id}: ${node.id} is ${sim.nodes[node.id].status}`);
    }
  }
});

test("Load-Balanced Microservices splits 10k three ways (3.3k/s per gRPC edge)", () => {
  const bp = getBlueprint("load-balanced-microservices");
  const sim = simulateTraffic({
    nodes: bp.nodes.map((x) => n(x.key, x.kind, x.overrides || {})),
    edges: bp.edges.map((x) => ({ id: `${x.from}-${x.to}`, from: x.from, to: x.to, protocol: x.protocol || "HTTPS" })),
    totalRps: 10000,
  });
  assert.equal(Math.round(sim.edges["lb-users"].rps), 3333);
  assert.equal(sim.edges["lb-orders"].protocol, "gRPC");
});

test("each studio mode shows different node facts", () => {
  const svc = n("a", "microservice", { label: "Orders API" });
  const db = n("d", "sql");
  const names = serviceNames([svc, db]);
  const canvas = nodeFacets(svc, "canvas", names);
  assert.equal(canvas.sub, "Business logic");
  assert.equal(canvas.badge, "");
  const k8s = nodeFacets(svc, "k8s", names);
  assert.deepEqual([k8s.sub, k8s.badge, k8s.chips], ["Deployment", "3/3 pods", ["ns/prod"]]);
  assert.equal(nodeFacets(db, "k8s", names).sub, "StatefulSet");
  assert.equal(nodeFacets({ ...svc, health: "degraded" }, "k8s", names).badgeTone, "warn");
  const compose = nodeFacets(svc, "compose", names);
  assert.deepEqual([compose.sub, compose.badge, compose.chips], ["orders-api", ":8080", ["service:latest", "×3"]]);
  assert.equal(nodeFacets(n("c", "client"), "k8s", names).sub, "External · outside the cluster");
  assert.equal(imageTag("nginx:1.27-alpine"), "nginx:1.27-alpine");
  assert.equal(imageTag("redis"), "redis:latest");
  assert.equal(k8sKind(svc), "Deployment");
});

test("Kubernetes YAML is block-style (short lines), namespaced, and StatefulSet-aware", () => {
  const yaml = kubernetesYaml([n("a", "microservice", { label: "API" }), n("d", "sql", { label: "DB" })]);
  assert.match(yaml, /kind: Deployment[\s\S]*namespace: prod[\s\S]*kind: Service/);
  assert.match(yaml, /kind: StatefulSet[\s\S]*serviceName: postgres/);
  assert.doesNotMatch(yaml, /\{ /, "no flow-style braces");
  assert.ok(Math.max(...yaml.split("\n").map((l) => l.length)) <= 60);
});

test("UI contract: Simulate is opt-in, drawer is 380/640 with tabs + copy, measurements skip system design nodes", () => {
  const dir = new URL("..", import.meta.url);
  const read = (f) => readFileSync(new URL(f, dir), "utf8");
  const hook = read("useSystemDesignWorkspace.js");
  const tabState = read("systemDesignTabState.js");
  assert.match(tabState, /simRunning: false/, "new tabs start with simulation OFF");
  assert.match(hook, /workspaceByTabId/);
  assert.match(hook, /activeWorkspace\.simRunning/);
  assert.match(hook, /restoreTabState/);
  const top = read("TopWorkspaceBar.jsx");
  for (const text of ["Blueprints", "Stop simulation", "Simulate", "BLUEPRINTS"]) assert.ok(top.includes(text), text);
  assert.ok(top.indexOf("Blueprints") < top.indexOf("Studio mode"), "Blueprints sits left of the mode switch");
  assert.match(read("SystemDesignStudio.jsx"), /Add a Client or Gateway node \(or load a Blueprint\) to simulate traffic\./);
  const drawer = read("ContextualInspectorDrawer.jsx");
  for (const text of ["Config & Load", "Node YAML", "Copy YAML", "Expand", "Compact"]) assert.ok(drawer.includes(text), text);
  const css = read("systemDesign.css");
  assert.match(css, /\.sd-drawer \{[^}]*width: min\(380px/);
  assert.match(css, /\.sd-drawer\.is-wide \{ width: min\(640px/);
  assert.match(css, /\.sd-yaml \{[^}]*white-space: pre-wrap/);
  const measure = readFileSync(new URL("../../../components/app/ShapeMeasurements.jsx", import.meta.url), "utf8");
  assert.match(measure, /sketchiziSystemDesign/);
});
