import test from "node:test";
import assert from "node:assert/strict";
import { PRIMITIVES, CATEGORIES, ACCENTS, PROTOCOLS, createNodeMeta, getPrimitiveForShortcut, primitivesByCategory } from "../primitives.js";

const EXPECTED = {
  edge: ["Web/Mobile Client", "CDN", "DNS / Route53", "API Gateway", "Load Balancer"],
  compute: ["Microservice", "Worker / Cron", "Serverless Function", "Auth / IAM"],
  data: ["SQL Database", "NoSQL Store", "Redis Cache", "Object Storage (S3)", "Search Index"],
  messaging: ["Message Queue / Kafka", "Metrics & Logging"],
};

test("catalog ships exactly 16 primitives in 4 categories with the specified names", () => {
  assert.equal(PRIMITIVES.length, 16);
  assert.equal(CATEGORIES.length, 4);
  for (const [category, labels] of Object.entries(EXPECTED)) {
    assert.deepEqual(PRIMITIVES.filter((p) => p.category === category).map((p) => p.label), labels);
  }
  assert.equal(new Set(PRIMITIVES.map((p) => p.kind)).size, 16);
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
  assert.equal(primitivesByCategory().flatMap((c) => c.items).length, 16);
});
