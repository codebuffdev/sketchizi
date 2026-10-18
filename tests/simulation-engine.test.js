import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulationProjection } from "../src/features/simulation/adapter/buildSimulationProjection.js";
import { runSimulation, SIMULATION_ENGINE_VERSION } from "../src/features/simulation/engine/runSimulation.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId, properties = {}) => ({ id, kind, sourceId, targetId, properties });
const baseEntities = [
  entity("web", "frontend.react-app", "Web client"),
  entity("api", "backend.rest-service", "Checkout API"),
  entity("endpoint", "backend.api-endpoint", "Checkout", { method: "POST", path: "/checkout" }),
  entity("db", "data.postgresql-database", "Checkout DB"),
];
const baseRelations = [
  relation("web-calls-endpoint", "calls", "web", "endpoint"),
  relation("api-exposes-endpoint", "exposes", "api", "endpoint"),
  relation("api-reads-db", "reads", "api", "db"),
  relation("api-writes-db", "writes", "api", "db"),
];
const baseProfiles = {
  web: { kind: "traffic-source", parameters: { trafficRps: 50 } },
  api: { kind: "request-service", parameters: { concurrency: 8, meanServiceMs: 25, serviceTimeCv: 0.2, bufferCapacity: 64, failureProbability: 0, timeoutMs: 0, retryAttempts: 0 } },
  db: { kind: "relational-store", parameters: { concurrency: 6, meanServiceMs: 30, serviceTimeCv: 0.2, bufferCapacity: 32, readFraction: 0.9, writeContentionMs: 15, failureProbability: 0 } },
};
function project({ entities = baseEntities, relations = baseRelations, profilesByEntityId = baseProfiles, durationMs = 10000, seed = 42 } = {}) {
  const built = buildSimulationProjection({
    workbench: { schemaVersion: 1, modelRevision: 7, activeViewId: "system", views: [{ id: "system", label: "System" }], entities: structuredClone(entities), relations: structuredClone(relations), viewScenes: {} },
    simulationProfile: { schemaVersion: 1, profilesByEntityId: structuredClone(profilesByEntityId), defaultScenario: { durationMs, seed } },
  });
  assert.equal(built.status, "ready", JSON.stringify(built.diagnostics, null, 2));
  return built;
}
const blockerCodes = (result) => result.diagnostics.filter((item) => item.severity === "blocker").map((item) => item.code);

test("runs a seeded client -> REST service -> PostgreSQL scenario with measurable results", () => {
  const result = runSimulation({ projection: project() });
  assert.equal(result.status, "completed", JSON.stringify(result.diagnostics, null, 2));
  assert.equal(result.result.simulation.engineVersion, SIMULATION_ENGINE_VERSION);
  assert.equal(result.result.simulation.deterministic, true);
  assert.ok(result.result.metrics.offeredRequests > 0);
  assert.ok(result.result.metrics.successfulRequests > 0);
  assert.equal(result.result.metrics.offeredRequests, result.result.metrics.successfulRequests + result.result.metrics.failedRequests + result.result.metrics.droppedRequests);
  assert.ok(result.result.metrics.successfulLatencyMs.p50 > 0);
  assert.ok(result.result.metrics.successfulLatencyMs.p95 >= result.result.metrics.successfulLatencyMs.p50);
  assert.equal(result.result.perNode.length, 2);
  assert.equal(result.result.perEdge.length, 2);
  assert.equal(result.result.schemaVersion, 2);
  assert.equal(result.result.timeSeries.source, "discrete-event-timestamps");
  assert.equal(result.result.timeSeries.points.length, 40);
  const points = result.result.timeSeries.points;
  const drain = result.result.timeSeries.postWindowDrain;
  assert.equal(points.reduce((sum, point) => sum + point.offeredRequests, 0), result.result.metrics.offeredRequests);
  assert.equal(points.reduce((sum, point) => sum + point.successfulRequests, 0), result.result.metrics.successfulCompletionsWithinWindow);
  assert.equal(points.reduce((sum, point) => sum + point.successfulRequests, 0) + drain.successfulRequests, result.result.metrics.successfulRequests);
  assert.equal(points.reduce((sum, point) => sum + point.failedRequests, 0) + drain.failedRequests, result.result.metrics.failedRequests);
  assert.equal(points.reduce((sum, point) => sum + point.droppedRequests, 0) + drain.droppedRequests, result.result.metrics.droppedRequests);
  assert.ok(points.some((point) => point.offeredRps > 0));
  assert.ok(points.some((point) => point.latencyP95Ms !== null));
});

test("identical model, profile, seed and overrides reproduce byte-equivalent result metrics", () => {
  const projection = project();
  const first = runSimulation({ projection });
  const second = runSimulation({ projection });
  assert.deepEqual(first.result, second.result);
});

test("increasing offered traffic produces additional capacity pressure in the example profile", () => {
  const projection = project({ durationMs: 15000, seed: 211 });
  const normal = runSimulation({ projection });
  const surge = runSimulation({ projection, scenarioOverrides: { trafficMultiplier: 5 } });
  assert.equal(normal.status, "completed");
  assert.equal(surge.status, "completed");
  assert.ok(surge.result.metrics.offeredRequests > normal.result.metrics.offeredRequests * 4);
  assert.ok(surge.result.metrics.droppedRequests > normal.result.metrics.droppedRequests || surge.result.bottlenecks.length > normal.result.bottlenecks.length || surge.result.perNode.some((item) => item.utilization > normal.result.perNode.find((x) => x.nodeId === item.nodeId).utilization));
});

test("a forced database failure is traceable and drives success rate to zero", () => {
  const result = runSimulation({ projection: project(), scenarioOverrides: { failureProbabilityByNodeId: { db: 1 } } });
  assert.equal(result.status, "completed");
  assert.equal(result.result.metrics.successfulRequests, 0);
  assert.equal(result.result.metrics.failedRequests, result.result.metrics.offeredRequests - result.result.metrics.droppedRequests);
  assert.equal(result.result.simulation.requestedFailureOverrides.db, 1);
  assert.ok(result.result.perNode.find((item) => item.sourceEntityId === "db").failed > 0);
});

test("a hard database outage fails at the dependency boundary without consuming database service capacity", () => {
  const projection = project();
  const baseline = runSimulation({ projection });
  const outage = runSimulation({ projection, scenarioOverrides: { unavailableNodeIds: ["db"] } });
  assert.equal(outage.status, "completed");
  assert.equal(outage.result.metrics.successfulRequests, 0);
  assert.equal(outage.result.metrics.failedRequests, outage.result.metrics.offeredRequests);
  assert.equal(outage.result.perNode.find((item) => item.sourceEntityId === "db").utilization, 0);
  assert.ok(outage.result.metrics.terminalLatencyMs.mean < baseline.result.metrics.successfulLatencyMs.mean);
  assert.deepEqual(outage.result.simulation.unavailableNodeIds, ["sim-node:db"]);
});

test("rejects malformed experiment overrides and unknown option keys", () => {
  const projection = project();
  assert.equal(runSimulation({ projection, scenarioOverrides: { unavailableNodeIds: "db" } }).status, "blocked");
  assert.equal(runSimulation({ projection, scenarioOverrides: { unexpectedFlag: true } }).status, "blocked");
  assert.equal(runSimulation({ projection, scenarioOverrides: { failureProbabilityByNodeId: null } }).status, "blocked");
});

test("blocks non-zero timeout and retry profiles instead of silently approximating them", () => {
  const profiles = structuredClone(baseProfiles);
  profiles.api.parameters.timeoutMs = 500;
  profiles.api.parameters.retryAttempts = 1;
  const projection = project({ profilesByEntityId: profiles });
  const result = runSimulation({ projection });
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("ENGINE-TIMEOUT-UNSUPPORTED"));
  assert.ok(blockerCodes(result).includes("ENGINE-RETRY-UNSUPPORTED"));
});

test("blocks asynchronous queue edges until queue scheduling semantics are implemented", () => {
  const entities = [...baseEntities, entity("queue", "messaging.queue", "Jobs"), entity("worker", "backend.worker", "Worker")];
  const relations = [...baseRelations, relation("api-publishes", "publishes", "api", "queue"), relation("worker-subscribes", "subscribes", "worker", "queue")];
  const profiles = { ...structuredClone(baseProfiles), queue: { kind: "message-queue", parameters: { bufferCapacity: 100, enqueueMs: 1, failureProbability: 0 } }, worker: { kind: "message-worker", parameters: { concurrency: 2, processingTimeMs: 20, serviceTimeCv: 0, bufferCapacity: 0, failureProbability: 0 } } };
  const projection = project({ entities, relations, profilesByEntityId: profiles });
  const result = runSimulation({ projection });
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("ENGINE-NODE-KIND-UNSUPPORTED") || blockerCodes(result).includes("ENGINE-EDGE-KIND-UNSUPPORTED"));
});

test("blocks multi-target routing instead of treating every connection as a required call", () => {
  const entities = [...baseEntities, entity("payments", "integrations.external-api", "Payments")];
  const relations = [...baseRelations.map((item) => ["api-reads-db", "api-writes-db"].includes(item.id) ? { ...item, properties: { invocation: "required" } } : item), relation("api-calls-payment", "calls", "api", "payments", { invocation: "required" })];
  const profiles = { ...structuredClone(baseProfiles), payments: { kind: "external-service-approximation", parameters: { concurrency: 2, meanServiceMs: 50, serviceTimeCv: 0, bufferCapacity: 5, failureProbability: 0, timeoutMs: 0 } } };
  const projection = project({ entities, relations, profilesByEntityId: profiles });
  const result = runSimulation({ projection });
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("ENGINE-ROUTING-UNSUPPORTED"));
});

test("blocks invalid override and excessive scenario sizes", () => {
  const projection = project();
  assert.equal(runSimulation({ projection, scenarioOverrides: { trafficMultiplier: 0 } }).status, "blocked");
  const bounded = runSimulation({ projection, limits: { maxRequests: 2 } });
  assert.equal(bounded.status, "blocked");
  assert.ok(blockerCodes(bounded).includes("ENGINE-REQUEST-LIMIT-EXCEEDED"));
});
