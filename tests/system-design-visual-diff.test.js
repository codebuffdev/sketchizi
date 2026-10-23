import test from "node:test";
import assert from "node:assert/strict";
import { diffSystemDesignGraphs } from "../src/features/architecture/systemDesignVisualDiff.js";

test("diff identifies added, removed, and changed components", () => {
  const result = diffSystemDesignGraphs(
    { nodes: [{ id: "api", name: "API", type: "service" }, { id: "db", name: "DB", type: "database" }], edges: [] },
    { nodes: [{ id: "api", name: "Public API", type: "service", replicas: 2 }, { id: "cache", name: "Cache", type: "cache" }], edges: [] }
  );
  assert.equal(result.counts.addedComponents, 1);
  assert.equal(result.counts.removedComponents, 1);
  assert.equal(result.counts.changedComponents, 1);
  assert.deepEqual(result.changedComponents[0].fields.sort(), ["name", "replicas"]);
});

test("diff compares connections by endpoints and relationship type, ignoring edge IDs", () => {
  const result = diffSystemDesignGraphs(
    { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }], edges: [{ id: "old", sourceId: "a", targetId: "b", type: "calls" }] },
    { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }], edges: [{ id: "new", sourceId: "a", targetId: "c", type: "calls" }] }
  );
  assert.equal(result.counts.addedConnections, 1);
  assert.equal(result.counts.removedConnections, 1);
  assert.equal(result.addedConnections[0].targetId, "c");
  assert.equal(result.removedConnections[0].targetId, "b");
});

test("diff handles empty and malformed graph collections safely", () => {
  const result = diffSystemDesignGraphs(null, { nodes: [null, { id: "x", name: "X" }], edges: [null, { sourceId: "x" }] });
  assert.equal(result.counts.addedComponents, 1);
  assert.equal(result.counts.addedConnections, 0);
  assert.equal(result.counts.removedComponents, 0);
});

test("comparison UI renders visual change groups and exports the diff", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../src/components/app/ArchitectureValidationPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /diffSystemDesignGraphs/);
  assert.match(source, /What changed/);
  assert.match(source, /Components added/);
  assert.match(source, /Connection changes/);
  assert.match(source, /systemComparison\.visualDiff/);
});
