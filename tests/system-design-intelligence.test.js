import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSystemDesignArchitecture } from "../src/features/architecture/systemDesignIntelligence.js";

test("system design analysis reports isolated components and missing endpoints", () => {
  const result = analyzeSystemDesignArchitecture({ nodes: [{ id: "api", name: "API" }, { id: "unused", name: "Unused" }], edges: [{ sourceId: "api", targetId: "missing" }] });
  assert.ok(result.errors.some((item) => item.code === "EDGE_ENDPOINT_MISSING"));
  assert.ok(result.warnings.some((item) => item.code === "ISOLATED_COMPONENT" && item.nodeIds.includes("unused")));
});

test("critical components with explicit single-replica metadata get a conditional resilience recommendation", () => {
  const result = analyzeSystemDesignArchitecture({ nodes: [{ id: "db", name: "Primary database", role: "database", replicas: 1, availabilityZones: 1 }, { id: "api", name: "API", role: "api", replicas: 3 }], edges: [{ sourceId: "api", targetId: "db", type: "reads" }] });
  assert.ok(result.warnings.some((item) => item.code === "SINGLE_REPLICA_CRITICAL_COMPONENT" && item.nodeIds[0] === "db"));
  assert.ok(result.info.some((item) => item.code === "SINGLE_ZONE_CRITICAL_COMPONENT"));
  assert.equal(result.summary.components, 2);
});

test("analysis is non-mutating and deduplicates repeated connections", () => {
  const graph = { nodes: [{ id: "a", name: "A" }, { id: "b", name: "B" }], edges: [{ sourceId: "a", targetId: "b", type: "calls" }, { sourceId: "a", targetId: "b", type: "calls" }] };
  const before = JSON.stringify(graph);
  const result = analyzeSystemDesignArchitecture(graph);
  assert.ok(result.warnings.some((item) => item.code === "DUPLICATE_CONNECTION"));
  assert.equal(JSON.stringify(graph), before);
});

test("empty or malformed input safely returns an empty report", () => {
  const result = analyzeSystemDesignArchitecture(null);
  assert.deepEqual(result.summary, { components: 0, connections: 0, errors: 0, warnings: 0, info: 0 });
});
