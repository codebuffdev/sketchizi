import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSystemDesignQuality } from "../src/features/architecture/systemDesignIntelligence.js";

test("identifies components unreachable from a directed request entry", () => {
  const result = analyzeSystemDesignQuality({ nodes: [{id:"client",role:"client"},{id:"api",role:"api"},{id:"orphan",role:"database"}], edges:[{sourceId:"client",targetId:"api"}] });
  assert.ok(result.diagnostics.some((item) => item.code === "UNREACHABLE_FROM_INGRESS" && item.nodeIds.includes("orphan")));
});
test("does not invent an ingress role when no entry point is identifiable", () => {
  const result = analyzeSystemDesignQuality({ nodes:[{id:"a",role:"service"},{id:"b",role:"database"}], edges:[{sourceId:"a",targetId:"b"}] });
  assert.ok(result.diagnostics.some((item) => item.code === "REQUEST_ENTRY_UNDEFINED"));
});
test("suggests reviewing shared data access without claiming a definite bottleneck", () => {
  const result = analyzeSystemDesignQuality({ nodes:[{id:"a",role:"service"},{id:"b",role:"service"},{id:"c",role:"worker"},{id:"db",role:"database"}], edges:[{sourceId:"a",targetId:"db"},{sourceId:"b",targetId:"db"},{sourceId:"c",targetId:"db"}] });
  assert.ok(result.diagnostics.some((item) => item.code === "SHARED_DATA_HOTSPOT_REVIEW"));
});
test("flags burst-capacity review when workload metadata and replica count support it", () => {
  const result = analyzeSystemDesignQuality({ nodes:[{id:"client",role:"client"},{id:"api",role:"api",trafficPattern:"bursty",replicas:1}], edges:[{sourceId:"client",targetId:"api"}] });
  assert.ok(result.diagnostics.some((item) => item.code === "BURST_CAPACITY_REVIEW"));
});
test("detects directed dependency cycles with stable diagnostic IDs", () => {
  const input = { nodes:[{id:"a",role:"service"},{id:"b",role:"service"}], edges:[{sourceId:"a",targetId:"b"},{sourceId:"b",targetId:"a"}] };
  const first = analyzeSystemDesignQuality(input), second = analyzeSystemDesignQuality(input);
  assert.ok(first.diagnostics.some((item) => item.code === "DIRECTED_DEPENDENCY_CYCLE"));
  assert.deepEqual(first.diagnostics.map((item) => item.diagnosticId), second.diagnostics.map((item) => item.diagnosticId));
});
test("analysis does not mutate the supplied graph", () => {
  const graph = { nodes:[{id:"client",role:"client"},{id:"api",role:"api"}], edges:[{sourceId:"client",targetId:"api"}] };
  const before = structuredClone(graph);
  analyzeSystemDesignQuality(graph);
  assert.deepEqual(graph, before);
});
