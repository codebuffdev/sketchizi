import test from "node:test";
import assert from "node:assert/strict";
import { compareSystemDesignArchitectures, normalizeSystemDesignGraph, scoreSystemDesignArchitecture } from "../src/features/architecture/systemDesignComparison.js";

const baseline = { nodes: [{ id: "client", name: "Client", role: "client" }, { id: "api", name: "API", role: "api", replicas: 1 }, { id: "db", name: "Database", role: "database" }], edges: [{ id: "e1", sourceId: "client", targetId: "api" }, { id: "e2", sourceId: "api", targetId: "db" }] };
const improved = { nodes: [{ id: "client", name: "Client", role: "client" }, { id: "api", name: "API", role: "api", replicas: 3, availabilityZones: 2 }, { id: "db", name: "Database", role: "database", replicas: 2, availabilityZones: 2 }, { id: "cache", name: "Cache", role: "cache" }], edges: [{ id: "e1", sourceId: "client", targetId: "api" }, { id: "e2", sourceId: "api", targetId: "db" }, { id: "e3", sourceId: "api", targetId: "cache" }] };

test("normalizes node and edge identifiers and identifies dangling edges", () => {
  const result = normalizeSystemDesignGraph({ nodes: [{ id: 1 }], edges: [{ sourceId: 1, targetId: 9 }] });
  assert.equal(result.nodes[0].id, "1");
  assert.equal(result.danglingEdges.length, 1);
});
test("scoring is deterministic and bounded to zero through one hundred", () => {
  const a = scoreSystemDesignArchitecture(baseline);
  assert.equal(a.score, scoreSystemDesignArchitecture(baseline).score);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.ok(a.scoring.method.includes("error=15"));
});
test("comparison uses identical scoring rules and explains its winner", () => {
  const result = compareSystemDesignArchitectures(baseline, improved);
  assert.equal(result.winner, "right");
  assert.ok(result.right.score > result.left.score);
  assert.equal(result.scoreDelta, result.right.score - result.left.score);
});
test("comparison exposes metric deltas and design-specific findings", () => {
  const result = compareSystemDesignArchitectures(baseline, improved);
  assert.ok(result.metrics.some((metric) => metric.label === "Components" && metric.delta === 1));
  assert.ok(Array.isArray(result.leftOnlyFindings));
  assert.ok(Array.isArray(result.rightOnlyFindings));
  assert.match(result.caveat, /not measured latency/i);
});
test("empty and malformed inputs do not throw", () => {
  const result = compareSystemDesignArchitectures(null, { nodes: null, edges: "bad" });
  assert.equal(result.left.metrics.components, 0);
  assert.equal(result.right.metrics.connections, 0);
});
