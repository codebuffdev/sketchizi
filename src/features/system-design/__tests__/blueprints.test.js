import test from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINTS } from "../blueprints.js";
import { createNodeMeta } from "../primitives.js";
import { simulateTraffic } from "../trafficSimulator.js";
import { compileDockerCompose, compileKubernetesStack } from "../stackCompiler.js";

const dimensions = (node) => ({
  x: Number.isFinite(node.x) ? node.x : node.at[0] * 300,
  y: Number.isFinite(node.y) ? node.y : node.at[1] * 130,
  width: node.width || 204,
  height: node.height || 88,
});
const endpoints = (edge) => ({ from: edge.fromNode || edge.from, to: edge.toNode || edge.to });

test("the catalogue contains 3 Core Patterns and 9 Alex Xu architectures", () => {
  assert.equal(BLUEPRINTS.length, 12);
  assert.equal(BLUEPRINTS.filter((item) => item.category === "Core Patterns").length, 3);
  assert.equal(BLUEPRINTS.filter((item) => item.category === "Alex Xu · System Design").length, 9);
});

test("all blueprint nodes have non-overlapping 204×88 geometry and all edges resolve", () => {
  for (const blueprint of BLUEPRINTS) {
    const ids = new Set(blueprint.nodes.map((node) => node.key));
    assert.equal(ids.size, blueprint.nodes.length, blueprint.id + ": duplicate node key");
    const rects = blueprint.nodes.map(dimensions);
    for (let i = 0; i < rects.length; i += 1) {
      assert.equal(rects[i].width, 204, blueprint.id + ": unexpected node width");
      assert.equal(rects[i].height, 88, blueprint.id + ": unexpected node height");
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j];
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y;
        assert.equal(overlaps, false, blueprint.id + ": overlapping nodes " + i + " and " + j);
      }
    }
    for (const edge of blueprint.edges) {
      const { from, to } = endpoints(edge);
      assert.ok(ids.has(from), blueprint.id + ": invalid fromNode " + from);
      assert.ok(ids.has(to), blueprint.id + ": invalid toNode " + to);
      if (blueprint.category === "Alex Xu · System Design") {
        assert.ok(edge.id && edge.fromPort && edge.toPort && edge.protocol, blueprint.id + ": incomplete orthogonal edge");
      }
    }
  }
});

test("every blueprint runs through traffic simulation and both stack compilers", () => {
  for (const blueprint of BLUEPRINTS) {
    const nodes = blueprint.nodes.map((item) => ({
      id: item.key,
      ...createNodeMeta(item.kind, item.overrides || {}),
      x: dimensions(item).x,
      y: dimensions(item).y,
      width: 204,
      height: 88,
    }));
    const edges = blueprint.edges.map((item, index) => ({
      id: item.id || `${item.from}-${item.to}-${index}`,
      from: item.fromNode || item.from,
      to: item.toNode || item.to,
      fromPort: item.fromPort || "right",
      toPort: item.toPort || "left",
      protocol: item.protocol || "HTTPS",
    }));
    const simulation = simulateTraffic({ nodes, edges, totalRps: 10000 });
    assert.equal(Object.keys(simulation.nodes).length, nodes.length, blueprint.id + ": missing simulation metrics");
    assert.doesNotThrow(() => compileDockerCompose(nodes, edges), blueprint.id + ": Compose compilation");
    assert.doesNotThrow(() => compileKubernetesStack(nodes, edges), blueprint.id + ": Kubernetes compilation");
  }
});

test("the Notification System blueprint has explicit channel, consent, callback, and audit flows", () => {
  const blueprint = BLUEPRINTS.find((item) => item.id === "notification-system");
  assert.ok(blueprint, "notification blueprint exists");
  const nodes = new Map(blueprint.nodes.map((node) => [node.key, node]));
  for (const key of ["prefs", "tokens", "bus", "pushQueue", "emailQueue", "push", "email", "pushProvider", "emailProvider", "webhook", "log"]) {
    assert.ok(nodes.has(key), "missing notification component: " + key);
  }
  assert.match(nodes.get("pushProvider").overrides.subtitle, /Push delivery APIs/);
  assert.match(nodes.get("emailProvider").overrides.subtitle, /SMS.*email delivery APIs/);
  assert.doesNotMatch(nodes.get("pushProvider").overrides.subtitle, /Stripe|LLM|Rate-limited/);
  assert.doesNotMatch(nodes.get("emailProvider").overrides.subtitle, /Stripe|LLM|Rate-limited/);

  const pairs = new Set(blueprint.edges.map((edge) => `${edge.fromNode}->${edge.toNode}`));
  for (const pair of [
    "service->prefs", "prefs->tokens", "tokens->bus",
    "bus->pushQueue", "bus->emailQueue",
    "pushQueue->push", "emailQueue->email",
    "push->pushProvider", "email->emailProvider",
    "pushProvider->webhook", "emailProvider->webhook", "webhook->log",
  ]) assert.ok(pairs.has(pair), "missing notification flow: " + pair);

  const sceneNodes = blueprint.nodes.map((item) => ({
    id: item.key,
    ...createNodeMeta(item.kind, item.overrides || {}),
  }));
  const sceneEdges = blueprint.edges.map((item) => ({
    id: item.id, from: item.fromNode, to: item.toNode, protocol: item.protocol,
  }));
  const simulation = simulateTraffic({ nodes: sceneNodes, edges: sceneEdges, totalRps: 10000 });
  assert.equal(simulation.edges["bus-pushQueue"].rps, 10000, "push topic receives broadcast traffic");
  assert.equal(simulation.edges["bus-emailQueue"].rps, 10000, "email topic receives broadcast traffic");
  assert.equal(simulation.nodes.push.status, "healthy");
  assert.equal(simulation.nodes.email.status, "healthy");
  assert.equal(simulation.nodes.log.status, "healthy");
});
