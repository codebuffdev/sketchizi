import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/features/simulation/engine/simulationEngine.js";
import { normalizeSimulationGraph, validateSimulationGraph } from "../src/features/simulation/graph/normalizeSimulationGraph.js";

function graph(nodes, edges = []) {
  return { schemaVersion: 1, domain: "process", nodes, edges, entryNodeIds: nodes.filter((node) => node.type === "start").map((node) => node.id), diagnostics: {} };
}

test("normalizes bound shapes and arrows without changing element metadata", () => {
  const elements = [
    { id: "a", type: "ellipse", customData: { awsResource: { id: "keep" } } },
    { id: "b", type: "rectangle", customData: { simulation: { nodeType: "task", config: { durationMs: 25 } } } },
    { id: "edge", type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: "b" }, customData: { awsRelationship: { relationshipType: "routes-to" } } },
  ];
  const result = normalizeSimulationGraph(elements);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges[0].sourceId, "a");
  assert.equal(result.nodes.find((node) => node.id === "b").config.durationMs, 25);
  assert.equal(elements[0].customData.awsResource.id, "keep");
  assert.equal(elements[2].customData.awsRelationship.relationshipType, "routes-to");
});

test("executes a start-task-end flow with virtual duration", () => {
  const model = graph([
    { id: "s", type: "start", config: {}, label: "Start" },
    { id: "t", type: "task", config: { durationMs: 100 }, label: "Task" },
    { id: "e", type: "end", config: {}, label: "End" },
  ], [
    { id: "st", sourceId: "s", targetId: "t", latencyMs: 10, condition: "always" },
    { id: "te", sourceId: "t", targetId: "e", latencyMs: 5, condition: "always" },
  ]);
  const engine = createSimulation(model, { seed: 5 });
  const result = engine.runToCompletion();
  assert.equal(result.status, "completed");
  assert.equal(result.virtualTimeMs, 115);
  assert.equal(result.metrics.completed, 1);
});

test("repeats seeded failure attempts and honors retry limit", () => {
  const model = graph([
    { id: "s", type: "start", config: {}, label: "Start" },
    { id: "t", type: "task", config: { durationMs: 1, failureProbability: 1, maxRetries: 2, retryDelayMs: 5 }, label: "Unreliable" },
    { id: "e", type: "end", config: {}, label: "End" },
  ], [
    { id: "st", sourceId: "s", targetId: "t", latencyMs: 0, condition: "always" },
    { id: "te", sourceId: "t", targetId: "e", latencyMs: 0, condition: "success" },
  ]);
  const result = createSimulation(model, { seed: 42 }).runToCompletion();
  assert.equal(result.status, "completed");
  assert.equal(result.metrics.retries, 2);
  assert.equal(result.metrics.failedAttempts, 3);
  assert.ok(result.eventLog.some((event) => event.type === "failure"));
});

test("validation rejects invalid duration and failure probability", () => {
  const issues = validateSimulationGraph(graph([{ id: "s", type: "start", config: { durationMs: -1, failureProbability: 2 }, label: "Start" }]));
  assert.ok(issues.some((issue) => issue.code === "invalid-duration"));
  assert.ok(issues.some((issue) => issue.code === "invalid-failure-probability"));
});


test("decision node routes using its seeded true/false outcome", () => {
  const model = graph([
    { id: "s", type: "start", config: {}, label: "Start" },
    { id: "d", type: "decision", config: { trueProbability: 1 }, label: "Decision" },
    { id: "yes", type: "end", config: {}, label: "Yes" },
    { id: "no", type: "end", config: {}, label: "No" },
  ], [
    { id: "sd", sourceId: "s", targetId: "d", condition: "always", latencyMs: 0 },
    { id: "dy", sourceId: "d", targetId: "yes", condition: "true", latencyMs: 0 },
    { id: "dn", sourceId: "d", targetId: "no", condition: "false", latencyMs: 0 },
  ]);
  const result = createSimulation(model, { seed: 12 }).runToCompletion();
  assert.equal(result.status, "completed");
  assert.ok(result.eventLog.some((event) => event.message.includes("selected true")));
  assert.ok(result.eventLog.some((event) => event.nodeId === "yes"));
  assert.ok(!result.eventLog.some((event) => event.nodeId === "no"));
});

test("infers start and end from labels and creates only one entry token", () => {
  const elements = [
    { id: "s", type: "ellipse" },
    { id: "s-label", type: "text", text: "start", containerId: "s" },
    { id: "p", type: "rectangle" },
    { id: "p-label", type: "text", text: "process", containerId: "p" },
    { id: "e", type: "ellipse" },
    { id: "e-label", type: "text", text: "end", containerId: "e" },
    { id: "sp", type: "arrow", startBinding: { elementId: "s" }, endBinding: { elementId: "p" } },
    { id: "pe", type: "arrow", startBinding: { elementId: "p" }, endBinding: { elementId: "e" } },
  ];
  const normalized = normalizeSimulationGraph(elements);
  assert.equal(normalized.nodes.find((node) => node.id === "s").type, "start");
  assert.equal(normalized.nodes.find((node) => node.id === "p").type, "task");
  assert.equal(normalized.nodes.find((node) => node.id === "e").type, "end");
  assert.deepEqual(normalized.entryNodeIds, ["s"]);
  const result = createSimulation(normalized, { seed: 2 }).runToCompletion();
  assert.equal(result.metrics.started, 1);
  assert.equal(result.metrics.completed, 1);
  assert.equal(result.virtualTimeMs, 100);
  assert.ok(result.eventLog.some((event) => event.message === "Flow completed."));
});
