import test from "node:test";
import assert from "node:assert/strict";
import { simulateTraffic, deriveStatus, computeP95, packetCountForRps, nodeCapacity } from "../trafficSimulator.js";

const node = (id, kind, extra = {}) => ({ id, kind, replicas: 2, capacityPerReplica: 10000, cacheHitRate: 0, health: "healthy", ...extra });
const edge = (from, to) => ({ id: `${from}-${to}`, from, to, protocol: "HTTPS" });

test("entry traffic splits proportionally across outgoing branches", () => {
  const r = simulateTraffic({
    nodes: [node("c", "client"), node("a", "microservice"), node("b", "microservice")],
    edges: [edge("c", "a"), edge("c", "b")], totalRps: 1000,
  });
  assert.equal(r.nodes.c.incomingRps, 1000);
  assert.equal(r.nodes.a.incomingRps, 500);
  assert.equal(r.nodes.b.incomingRps, 500);
  assert.equal(r.edges["c-a"].rps, 500);
});

test("redis cache shields the database by (1 - cacheHitRate)", () => {
  const r = simulateTraffic({
    nodes: [node("c", "client"), node("cache", "redis", { cacheHitRate: 0.8 }), node("db", "sql", { capacityPerReplica: 5000 })],
    edges: [edge("c", "cache"), edge("cache", "db")], totalRps: 10000,
  });
  assert.equal(r.nodes.cache.incomingRps, 10000);
  assert.equal(r.nodes.cache.shieldedRps, 8000);
  assert.equal(r.nodes.db.incomingRps, 2000);
});

test("CDN with 90% hit rate leaves 10% for the origin; hit rate 0 forwards everything", () => {
  const mk = (rate) => simulateTraffic({
    nodes: [node("cdn", "cdn", { cacheHitRate: rate }), node("origin", "api-gateway")], edges: [edge("cdn", "origin")], totalRps: 10000,
  }).nodes.origin.incomingRps;
  assert.equal(mk(0.9), 1000);
  assert.equal(mk(0), 10000);
});

test("utilization, status thresholds and p95", () => {
  assert.equal(deriveStatus(0.74), "healthy");
  assert.equal(deriveStatus(0.75), "elevated");
  assert.equal(deriveStatus(1), "elevated");
  assert.equal(deriveStatus(1.01), "overloaded");
  assert.equal(deriveStatus(0.1, "degraded"), "elevated");
  assert.equal(deriveStatus(0.1, "down"), "down");
  assert.equal(nodeCapacity({ replicas: 3, capacityPerReplica: 1200 }), 3600);
  assert.ok(computeP95(20, 0.2) < computeP95(20, 0.9));
  assert.ok(computeP95(20, 0.9) < computeP95(20, 1.5));
  assert.ok(computeP95(20, 0.3, "degraded") > computeP95(20, 0.3));
  assert.equal(computeP95(20, 0.3, "down"), null);
});

test("utilization = incomingRps / (replicas * capacityPerReplica)", () => {
  const r = simulateTraffic({ nodes: [node("c", "client"), node("s", "microservice", { replicas: 2, capacityPerReplica: 1000 })], edges: [edge("c", "s")], totalRps: 1500 });
  assert.equal(r.nodes.s.utilization, 0.75);
  assert.equal(r.nodes.s.status, "elevated");
  const over = simulateTraffic({ nodes: [node("c", "client"), node("s", "microservice", { replicas: 1, capacityPerReplica: 1000 })], edges: [edge("c", "s")], totalRps: 1500 });
  assert.equal(over.nodes.s.status, "overloaded");
  assert.equal(over.nodes.s.droppedRps, 500);
});

test("a node manually set Down drops downstream throughput to zero", () => {
  const r = simulateTraffic({
    nodes: [node("c", "client"), node("svc", "microservice", { health: "down" }), node("db", "sql")],
    edges: [edge("c", "svc"), edge("svc", "db")], totalRps: 1000,
  });
  assert.equal(r.nodes.svc.status, "down");
  assert.equal(r.nodes.db.incomingRps, 0);
  assert.equal(r.edges["svc-db"].rps, 0);
});

test("overloaded nodes only forward what they can serve", () => {
  const r = simulateTraffic({
    nodes: [node("c", "client"), node("svc", "microservice", { replicas: 1, capacityPerReplica: 400 }), node("db", "sql")],
    edges: [edge("c", "svc"), edge("svc", "db")], totalRps: 1000,
  });
  assert.equal(r.nodes.db.incomingRps, 400);
});

test("simulation is deterministic and survives cycles and dangling edges", () => {
  const input = { nodes: [node("c", "client"), node("a", "microservice"), node("b", "microservice")], edges: [edge("c", "a"), edge("a", "b"), edge("b", "a"), edge("a", "ghost")], totalRps: 777 };
  const first = simulateTraffic(input);
  assert.deepEqual(simulateTraffic(input), first);
  assert.ok(Number.isFinite(first.nodes.a.incomingRps));
});

test("packets scale with edge RPS and idle edges have none", () => {
  assert.equal(packetCountForRps(0), 0);
  assert.ok(packetCountForRps(50000) > packetCountForRps(10));
  assert.ok(packetCountForRps(1e9) <= 6);
});
