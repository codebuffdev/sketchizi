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


test("load balancer health checks redistribute all traffic across surviving targets", () => {
  const r = simulateTraffic({
    nodes: [
      node("client", "client"),
      node("lb", "load-balancer"),
      node("users", "microservice"),
      node("orders", "microservice", { health: "down" }),
      node("catalog", "microservice"),
      node("users-db", "sql"),
      node("catalog-cache", "redis"),
    ],
    edges: [
      edge("client", "lb"),
      edge("lb", "users"),
      edge("lb", "orders"),
      edge("lb", "catalog"),
      edge("users", "users-db"),
      edge("catalog", "catalog-cache"),
    ],
    totalRps: 10000,
  });

  assert.equal(r.edges["lb-users"].rps, 5000);
  assert.equal(r.edges["lb-orders"].rps, 0);
  assert.equal(r.edges["lb-catalog"].rps, 5000);
  assert.equal(r.edges["lb-orders"].healthCheckFailed, true);
  assert.equal(r.edges["lb-orders"].inactiveReason, "Health Check Failed");
  assert.equal(r.nodes.users.incomingRps, 5000);
  assert.equal(r.nodes.catalog.incomingRps, 5000);
  assert.equal(r.nodes.orders.incomingRps, 0);
  assert.equal(r.nodes["users-db"].incomingRps, 5000);
  assert.equal(r.nodes["catalog-cache"].incomingRps, 5000);
  const failedRoute = r.healthChecks.find((group) => group.downTargets === 1);
  assert.equal(failedRoute.healthyTargets, 0);
  assert.equal(failedRoute.downTargets, 1);
  assert.equal(r.diagnostics.noHealthyUpstreams, false);
});

test("load balancer with no healthy upstream targets returns zero RPS and a 503 diagnostic flag", () => {
  const r = simulateTraffic({
    nodes: [
      node("client", "client"),
      node("lb", "load-balancer"),
      node("a", "microservice", { health: "down" }),
      node("b", "microservice", { health: "down" }),
    ],
    edges: [edge("client", "lb"), edge("lb", "a"), edge("lb", "b")],
    totalRps: 10000,
  });
  assert.equal(r.edges["lb-a"].rps, 0);
  assert.equal(r.edges["lb-b"].rps, 0);
  assert.equal(r.diagnostics.noHealthyUpstreams, true);
  assert.equal(r.healthChecks[0].allTargetsDown, true);
});

test("API gateway also excludes Down targets when distributing traffic", () => {
  const r = simulateTraffic({
    nodes: [
      node("gateway", "api-gateway"),
      node("healthy", "microservice"),
      node("down", "microservice", { health: "down" }),
    ],
    edges: [edge("gateway", "healthy"), edge("gateway", "down")],
    totalRps: 1000,
  });
  assert.equal(r.edges["gateway-healthy"].rps, 1000);
  assert.equal(r.edges["gateway-down"].rps, 0);
});


test("distinct LB routes remain isolated while identical labels fail over as a replica pool", () => {
  const distinct = simulateTraffic({
    nodes: [node("client", "client"), node("lb", "load-balancer"),
      node("users", "microservice", { label: "Users Service" }),
      node("orders", "microservice", { label: "Orders Service", health: "down" }),
      node("catalog", "microservice", { label: "Catalog Service" })],
    edges: [edge("client", "lb"), edge("lb", "users"), edge("lb", "orders"), edge("lb", "catalog")],
    totalRps: 10000,
  });
  assert.equal(distinct.edges["lb-users"].rps, 3333.3);
  assert.equal(distinct.edges["lb-orders"].rps, 0);
  assert.equal(distinct.edges["lb-orders"].serviceUnavailable, true);
  assert.equal(distinct.edges["lb-orders"].inactiveReason, "503 Dropped");
  assert.equal(distinct.edges["lb-catalog"].rps, 3333.3);
  assert.equal(distinct.diagnostics.noHealthyUpstreams, false);

  const replicas = simulateTraffic({
    nodes: [node("client", "client"), node("lb", "load-balancer"),
      node("orders-a", "microservice", { label: "Order Service", health: "down" }),
      node("orders-b", "microservice", { label: " order   service " })],
    edges: [edge("client", "lb"), edge("lb", "orders-a"), edge("lb", "orders-b")],
    totalRps: 10000,
  });
  assert.equal(replicas.edges["lb-orders-a"].rps, 0);
  assert.equal(replicas.edges["lb-orders-a"].replicaFailed, true);
  assert.equal(replicas.edges["lb-orders-b"].rps, 10000);
});

test("Redis down bypasses cache and causes a full-read cache stampede", async () => {
  const { deriveArchitectureDiagnostic } = await import("../architectureDiagnostics.js");
  const nodes = [node("client", "client"), node("cache", "redis", { label: "Redis Cache", health: "down" }), node("db", "sql", { label: "Primary DB", replicas: 1, capacityPerReplica: 20000 })];
  const edges = [edge("client", "cache"), edge("cache", "db")];
  const r = simulateTraffic({ nodes, edges, totalRps: 10000 });
  assert.equal(r.nodes.cache.cacheHitRate, 0);
  assert.equal(r.nodes.cache.shieldedRps, 0);
  assert.equal(r.edges["cache-db"].rps, 10000);
  assert.equal(r.nodes.db.incomingRps, 10000);
  const diagnostic = deriveArchitectureDiagnostic(nodes, r, edges);
  assert.match(diagnostic.message, /Cache Stampede/);
  assert.match(diagnostic.message, /100% of traffic \(10k\/s\) hitting Primary DB/);
});

test("overloaded cache bypasses hit-rate shielding instead of shedding read traffic", () => {
  const r = simulateTraffic({
    nodes: [node("client", "client"), node("cache", "redis", { replicas: 1, capacityPerReplica: 1000, cacheHitRate: 0.8 }), node("db", "sql", { replicas: 3, capacityPerReplica: 20000 })],
    edges: [edge("client", "cache"), edge("cache", "db")], totalRps: 10000,
  });
  assert.equal(r.nodes.cache.status, "overloaded");
  assert.equal(r.nodes.cache.cacheHitRate, 0);
  assert.equal(r.edges["cache-db"].rps, 10000);
  assert.equal(r.nodes.db.incomingRps, 10000);
});

test("queue buffers consumer outage without making the producer unhealthy", async () => {
  const { deriveArchitectureDiagnostic } = await import("../architectureDiagnostics.js");
  const nodes = [node("producer", "microservice", { label: "Order Service" }), node("queue", "queue", { label: "Order Events" }), node("worker", "worker", { label: "Notification Worker", health: "down" })];
  const edges = [edge("producer", "queue"), edge("queue", "worker")];
  const r = simulateTraffic({ nodes, edges, totalRps: 5000 });
  assert.equal(r.nodes.producer.status, "healthy");
  assert.equal(r.nodes.producer.droppedRps, 0);
  assert.equal(r.nodes.queue.status, "lagging");
  assert.equal(r.nodes.queue.incomingRps, 5000);
  assert.equal(r.edges["queue-worker"].rps, 0);
  assert.equal(r.edges["queue-worker"].consumerDown, true);
  assert.match(deriveArchitectureDiagnostic(nodes, r, edges).message, /Consumer Lag/);
});

test("synchronous database p95 latency bubbles up into the calling service", () => {
  const r = simulateTraffic({
    nodes: [node("client", "client"), node("service", "microservice", { baseLatencyMs: 25 }), node("db", "sql", { replicas: 1, capacityPerReplica: 4000, baseLatencyMs: 20 })],
    edges: [edge("client", "service"), edge("service", "db")], totalRps: 1000,
  });
  assert.ok(r.nodes.db.p95Ms >= 20 && r.nodes.db.p95Ms <= 25);
  assert.ok(r.nodes.service.p95Ms > r.nodes.service.serviceP95Ms);
  assert.equal(r.nodes.service.p95Ms, Number((r.nodes.service.serviceP95Ms + r.nodes.db.p95Ms).toFixed(1)));
});

test("cycle traversal is bounded and reports the circular dependency", async () => {
  const { deriveArchitectureDiagnostic } = await import("../architectureDiagnostics.js");
  const nodes = [node("a", "microservice", { label: "Service A" }), node("b", "microservice", { label: "Service B" })];
  const edges = [edge("a", "b"), edge("b", "a")];
  const r = simulateTraffic({ nodes, edges, totalRps: 1000 });
  assert.ok(Number.isFinite(r.nodes.a.incomingRps));
  assert.ok(Number.isFinite(r.nodes.b.incomingRps));
  assert.equal(r.diagnostics.cycles.length, 1);
  assert.match(deriveArchitectureDiagnostic(nodes, r, edges).message, /Circular dependency detected between Service A and Service B/);
  assert.equal(r.edges["b-a"].cycleBlocked, true);
});

test("multiple client entry points sum their traffic at a shared gateway", () => {
  const r = simulateTraffic({
    nodes: [node("web", "client"), node("mobile", "client"), node("gateway", "api-gateway"), node("service", "microservice")],
    edges: [edge("web", "gateway"), edge("mobile", "gateway"), edge("gateway", "service")],
    totalRps: 10000,
  });
  assert.equal(r.nodes.web.incomingRps, 5000);
  assert.equal(r.nodes.mobile.incomingRps, 5000);
  assert.equal(r.nodes.gateway.incomingRps, 10000);
  assert.equal(r.nodes.service.incomingRps, 10000);
});

test("degraded synchronous dependency amplifies edge traffic by 25 percent", () => {
  const r = simulateTraffic({
    nodes: [node("service", "microservice"), node("db", "sql", { health: "degraded" })],
    edges: [edge("service", "db")], totalRps: 1000,
  });
  assert.equal(r.edges["service-db"].rps, 1250);
  assert.equal(r.edges["service-db"].retryAmplification, 1.25);
});
