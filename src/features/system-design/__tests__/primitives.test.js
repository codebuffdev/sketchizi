import test from "node:test";
import assert from "node:assert/strict";
import { PRIMITIVES, CATEGORIES, ACCENTS, PROTOCOLS, createNodeMeta, getPrimitiveForShortcut, primitivesByCategory } from "../primitives.js";

const EXPECTED = {
  edge: ["Web/Mobile Client", "CDN", "DNS / Route53", "API Gateway", "Load Balancer", "WebSocket Gateway"],
  compute: ["Microservice", "Worker / Cron", "Serverless Function", "Auth / IAM", "Stream Processor"],
  data: ["SQL Database", "NoSQL Store", "Redis Cache", "Object Storage (S3)", "Search Index", "Read Replica", "Data Warehouse (OLAP)"],
  messaging: ["Message Queue / Kafka", "Pub/Sub Event Bus", "Metrics & Logging"],
  integration: ["External 3rd-Party API"],
};

test("catalog ships exactly 22 primitives in 5 categories with the specified names", () => {
  assert.equal(PRIMITIVES.length, 22);
  assert.equal(CATEGORIES.length, 5);
  for (const [category, labels] of Object.entries(EXPECTED)) {
    assert.deepEqual(PRIMITIVES.filter((p) => p.category === category).map((p) => p.label), labels);
  }
  assert.equal(new Set(PRIMITIVES.map((p) => p.kind)).size, 22);
});

test("every primitive defines complete default metadata", () => {
  for (const p of PRIMITIVES) {
    assert.ok(ACCENTS.includes(p.accent), `${p.kind} accent`);
    assert.ok(PROTOCOLS.includes(p.defaultProtocol), `${p.kind} protocol`);
    assert.ok(p.replicas >= 1 && p.capacityPerReplica > 0 && p.port > 0 && p.image, `${p.kind} numeric defaults`);
    assert.ok(p.cacheHitRate >= 0 && p.cacheHitRate <= 1);
  }
  const redis = PRIMITIVES.find((p) => p.kind === "redis");
  assert.equal(redis.defaultProtocol, "RESP");
  assert.ok(redis.cacheHitRate > 0 && redis.cache);
  assert.ok(PRIMITIVES.find((p) => p.kind === "cdn").cacheHitRate > 0);
  assert.equal(PRIMITIVES.find((p) => p.kind === "sql").defaultProtocol, "SQL");
  assert.equal(PRIMITIVES.find((p) => p.kind === "queue").defaultProtocol, "Kafka");
  assert.equal(PRIMITIVES.find((p) => p.kind === "microservice").defaultProtocol, "gRPC");
});

test("no primitive or accent uses purple", () => {
  assert.deepEqual([...ACCENTS], ["slate", "emerald", "amber"]);
  assert.ok(!JSON.stringify(PRIMITIVES).match(/purple|violet|indigo/i));
});

test("shortcuts 1-9 map to the first nine primitives; 0 and 10+ map to nothing", () => {
  assert.equal(getPrimitiveForShortcut("1").kind, PRIMITIVES[0].kind);
  assert.equal(getPrimitiveForShortcut("9").kind, PRIMITIVES[8].kind);
  assert.equal(getPrimitiveForShortcut("0"), null);
  assert.equal(getPrimitiveForShortcut("a"), null);
});

test("createNodeMeta copies defaults and rejects unknown kinds", () => {
  const meta = createNodeMeta("redis", { label: "Session cache" });
  assert.equal(meta.label, "Session cache");
  assert.equal(meta.health, "healthy");
  assert.throws(() => createNodeMeta("nope"));
  assert.equal(primitivesByCategory().flatMap((c) => c.items).length, 22);
});

test("six added primitives preserve their role, category, capacity and p95 defaults", () => {
  const expected = {
    "read-replica": ["data", "Async read scaling", 6000, 12],
    pubsub: ["messaging", "Fan-out topics", 25000, 6],
    "stream-processor": ["compute", "Flink · Kafka Streams", 12000, 22],
    warehouse: ["data", "ClickHouse · BigQuery", 8000, 45],
    "websocket-gateway": ["edge", "Stateful · Live push", 15000, 9],
    "external-api": ["integration", "Stripe · LLM · Rate-limited", 2000, 240],
  };
  for (const [kind, [category, subtitle, capacity, p95]] of Object.entries(expected)) {
    const primitive = PRIMITIVES.find((item) => item.kind === kind);
    assert.ok(primitive, kind);
    assert.equal(primitive.category, category);
    assert.equal(primitive.subtitle, subtitle);
    assert.equal(primitive.capacityPerReplica, capacity);
    assert.equal(primitive.baseLatencyMs, p95);
  }
});
