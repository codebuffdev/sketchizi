import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulationProjection, SIMIR_SCHEMA_VERSION } from "../src/features/simulation/adapter/buildSimulationProjection.js";

function entity(id, kind, name = id, properties = {}) { return { id, kind, name, properties }; }
function relation(id, kind, sourceId, targetId, properties = {}) { return { id, kind, sourceId, targetId, properties }; }

const entities = [
  entity("web", "frontend.react-app", "Web client"),
  entity("api", "backend.rest-service", "Checkout API"),
  entity("endpoint", "backend.api-endpoint", "Create checkout", { method: "POST", path: "/checkout" }),
  entity("db", "data.postgresql-database", "Checkout DB"),
  entity("deploy", "devops.deployment-target", "Production"),
];
const relations = [
  relation("web-calls-endpoint", "calls", "web", "endpoint"),
  relation("api-exposes-endpoint", "exposes", "api", "endpoint"),
  relation("api-reads-db", "reads", "api", "db"),
  relation("api-writes-db", "writes", "api", "db"),
  relation("api-deploys", "deploys-to", "api", "deploy"),
];
const profilesByEntityId = {
  web: { kind: "traffic-source", parameters: { trafficRps: 50 } },
  api: { kind: "request-service", parameters: { concurrency: 8, meanServiceMs: 25, serviceTimeCv: 0.6, bufferCapacity: 64, failureProbability: 0, timeoutMs: 0, retryAttempts: 0 } },
  db: { kind: "relational-store", parameters: { concurrency: 6, meanServiceMs: 30, serviceTimeCv: 0.7, bufferCapacity: 32, readFraction: 0.9, writeContentionMs: 15, failureProbability: 0 } },
};
function fixture(overrides = {}) {
  return {
    workbench: {
      schemaVersion: 1, modelRevision: 12, activeViewId: "system",
      views: [{ id: "system", label: "System" }, { id: "data", label: "Data" }],
      entities: structuredClone(overrides.entities || entities),
      relations: structuredClone(overrides.relations || relations),
      viewScenes: {},
    },
    simulationProfile: {
      schemaVersion: 1,
      profilesByEntityId: structuredClone(overrides.profilesByEntityId || profilesByEntityId),
      defaultScenario: { durationMs: 30000, seed: 42 },
    },
  };
}
const blockerCodes = (result) => result.diagnostics.filter((item) => item.severity === "blocker").map((item) => item.code);

test("compiles the full-stack example into a ready, engine-neutral projection", () => {
  const result = buildSimulationProjection(fixture());
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  assert.equal(result.topology.schemaVersion, SIMIR_SCHEMA_VERSION);
  assert.equal(result.topology.semantics, "sketchizi-runtime-ir");
  assert.deepEqual(result.topology.nodes.map((node) => node.id), ["sim-node:api", "sim-node:db", "sim-node:web"]);
  assert.equal(result.nodeMap.endpoint, null, "API endpoints remain contract-only");
  assert.equal(result.topology.edges.length, 2, "calls to endpoint resolve to service and read/write edges are grouped");
  const databaseEdge = result.topology.edges.find((edge) => edge.parameters.operation === "database-access");
  assert.ok(databaseEdge);
  assert.deepEqual(databaseEdge.sourceRelationIds, ["api-reads-db", "api-writes-db"]);
  assert.equal(databaseEdge.parameters.reads, true);
  assert.equal(databaseEdge.parameters.writes, true);
  assert.deepEqual(result.edgeMap["api-reads-db"], result.edgeMap["api-writes-db"]);
});

test("projection is deterministic and independent of active view", () => {
  const input = fixture();
  const first = buildSimulationProjection(input);
  input.workbench.activeViewId = "data";
  const second = buildSimulationProjection(input);
  assert.deepEqual(first.topology, second.topology);
  assert.equal(first.provenance.sourceModelFingerprint, second.provenance.sourceModelFingerprint);
  assert.equal(first.provenance.activeViewIgnored, true);
});

test("semantic fingerprint is stable when entity/relation arrays are reordered", () => {
  const input = fixture();
  const first = buildSimulationProjection(input);
  input.workbench.entities.reverse();
  input.workbench.relations.reverse();
  const second = buildSimulationProjection(input);
  assert.equal(first.provenance.sourceModelFingerprint, second.provenance.sourceModelFingerprint);
  assert.deepEqual(first.topology, second.topology);
});

test("active-view scope includes its connected model path but excludes an unrelated external API", () => {
  const extraEntities = [...entities, entity("external", "integrations.external-api", "Unused payment API")];
  const extraRelations = [...relations, relation("api-depends-external", "depends-on", "api", "external")];
  const extraProfiles = {
    ...profilesByEntityId,
    external: { kind: "external-service-approximation", parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 0 } },
  };
  const result = buildSimulationProjection({ ...fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: extraProfiles }), scopeEntityIds: ["web", "api", "db"] });
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.topology.nodes.map((node) => node.sourceEntityId).sort(), ["api", "db", "web"]);
  assert.ok(!result.provenance.scopeEntityIds.includes("external"));
  assert.ok(result.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE" && item.entityIds.includes("external")));
  assert.ok(!result.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION"));
});

test("active-view scope excludes disconnected runtime placements even when they are present on the view", () => {
  const extraEntities = [...entities, entity("external", "integrations.external-api", "Unused payment API")];
  const extraRelations = [...relations, relation("api-depends-external", "depends-on", "api", "external")];
  const extraProfiles = {
    ...profilesByEntityId,
    external: { kind: "external-service-approximation", parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 0 } },
  };
  const result = buildSimulationProjection({
    ...fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: extraProfiles }),
    scopeEntityIds: ["web", "api", "endpoint", "db", "deploy", "external"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.topology.nodes.map((node) => node.sourceEntityId).sort(), ["api", "db", "web"]);
  assert.ok(result.provenance.scopeSeedEntityIds.includes("external"), "external placement is present in the active view");
  assert.ok(!result.provenance.scopeEntityIds.includes("external"), "disconnected API is not part of the client request path");
  assert.ok(result.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE" && item.entityIds.includes("external")));
  assert.ok(!result.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION"));
  assert.deepEqual(result.provenance.scopeRootEntityIds, ["web"]);
});

test("a connected external API remains in scope and is disclosed as an approximation", () => {
  const scopedEntities = [entity("web", "frontend.react-app", "Web"), entity("api", "backend.rest-service", "API"), entity("external", "integrations.external-api", "Payments")];
  const scopedRelations = [relation("web-api", "calls", "web", "api"), relation("api-external", "calls", "api", "external")];
  const scopedProfiles = {
    web: profilesByEntityId.web,
    api: profilesByEntityId.api,
    external: { kind: "external-service-approximation", parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 0 } },
  };
  const input = fixture({ entities: scopedEntities, relations: scopedRelations, profilesByEntityId: scopedProfiles });
  const result = buildSimulationProjection({ ...input, scopeEntityIds: ["web", "api"] });
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  assert.ok(result.provenance.scopeEntityIds.includes("external"));
  assert.ok(result.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION" && item.entityIds.includes("external")));
  assert.ok(!result.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE"));
});

test("blocks when a mapped runtime entity lacks an explicit profile", () => {
  const input = fixture({ profilesByEntityId: { web: profilesByEntityId.web, api: profilesByEntityId.api } });
  const result = buildSimulationProjection(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.topology, null);
  assert.ok(blockerCodes(result).includes("SIM-PROFILE-MISSING"));
});

test("blocks API endpoint calls without exactly one owner", () => {
  const input = fixture({ relations: relations.filter((item) => item.kind !== "exposes") });
  const result = buildSimulationProjection(input);
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-ENDPOINT-OWNER-MISSING"));
});

test("blocks API endpoint calls with multiple owners", () => {
  const moreEntities = [...entities, entity("api2", "backend.rest-service", "Other API")];
  const moreRelations = [...relations, relation("api2-exposes-endpoint", "exposes", "api2", "endpoint")];
  const moreProfiles = { ...profilesByEntityId, api2: profilesByEntityId.api };
  const result = buildSimulationProjection(fixture({ entities: moreEntities, relations: moreRelations, profilesByEntityId: moreProfiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-ENDPOINT-OWNER-AMBIGUOUS"));
});

test("blocks unconfirmed assumptions on parameters marked as assumptions", () => {
  const profiles = structuredClone(profilesByEntityId);
  profiles.api.assumptions = { meanServiceMs: { status: "proposed", reason: "placeholder" } };
  const result = buildSimulationProjection(fixture({ profilesByEntityId: profiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-ASSUMPTION-UNCONFIRMED"));
});

test("groups reads and writes into one runtime hop and does not duplicate the database call", () => {
  const result = buildSimulationProjection(fixture());
  const dbEdges = result.topology.edges.filter((edge) => edge.targetId === "sim-node:db");
  assert.equal(dbEdges.length, 1);
});

test("maps queue subscriptions from queue to worker while preserving relation provenance", () => {
  const extraEntities = [...entities, entity("queue", "messaging.queue", "Jobs"), entity("worker", "backend.worker", "Worker")];
  const extraRelations = [...relations, relation("api-publishes", "publishes", "api", "queue"), relation("worker-subscribes", "subscribes", "worker", "queue")];
  const profiles = {
    ...profilesByEntityId,
    queue: { kind: "message-queue", parameters: { bufferCapacity: 1000, enqueueMs: 1, failureProbability: 0 } },
    worker: { kind: "message-worker", parameters: { concurrency: 4, processingTimeMs: 20, serviceTimeCv: 0.4, bufferCapacity: 0, failureProbability: 0 } },
  };
  const result = buildSimulationProjection(fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: profiles }));
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  const consume = result.topology.edges.find((edge) => edge.kind === "consume");
  assert.equal(consume.sourceId, "sim-node:queue");
  assert.equal(consume.targetId, "sim-node:worker");
  assert.deepEqual(consume.sourceRelationIds, ["worker-subscribes"]);
  assert.deepEqual(consume.sourceRelationEndpoints, [{ relationId: "worker-subscribes", sourceEntityId: "worker", targetEntityId: "queue" }], "provenance preserves the original Workbench relation direction");
});

test("blocks ambiguous multi-target request paths unless every branch is explicitly required", () => {
  const extraEntities = [...entities, entity("external", "integrations.external-api", "Payment")];
  const extraRelations = [...relations, relation("api-calls-external", "calls", "api", "external")];
  const profiles = {
    ...profilesByEntityId,
    external: { kind: "external-service-approximation", parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 1000 } },
  };
  const result = buildSimulationProjection(fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: profiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-ROUTING-AMBIGUOUS"));
});

test("allows explicit required fan-out and warns that external APIs are approximations", () => {
  const extraEntities = [...entities, entity("external", "integrations.external-api", "Payment")];
  const explicitBaseRelations = relations.map((item) => ["api-reads-db", "api-writes-db"].includes(item.id) ? { ...item, properties: { invocation: "required" } } : item);
  const extraRelations = [...explicitBaseRelations, relation("api-calls-external", "calls", "api", "external", { invocation: "required" }), relation("web-call-api-required", "calls", "web", "api", { invocation: "required" })];
  const profiles = {
    ...profilesByEntityId,
    external: { kind: "external-service-approximation", parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 1000 } },
  };
  const result = buildSimulationProjection(fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: profiles }));
  assert.equal(result.status, "ready", JSON.stringify(result.diagnostics, null, 2));
  assert.ok(result.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION"));
});

test("blocks synchronous request cycles", () => {
  const extraEntities = [...entities, entity("api2", "backend.rest-service", "Back edge")];
  const extraRelations = [...relations, relation("api-calls-api2", "calls", "api", "api2"), relation("api2-calls-api", "calls", "api2", "api")];
  const profiles = { ...profilesByEntityId, api2: profilesByEntityId.api };
  const result = buildSimulationProjection(fixture({ entities: extraEntities, relations: extraRelations, profilesByEntityId: profiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-SYNC-CYCLE"));
});

test("blocks unknown profile parameter names instead of silently passing typos downstream", () => {
  const profiles = structuredClone(profilesByEntityId);
  profiles.api.parameters.meanServiceMS = profiles.api.parameters.meanServiceMs;
  delete profiles.api.parameters.meanServiceMs;
  const result = buildSimulationProjection(fixture({ profilesByEntityId: profiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-PROFILE-PARAMETERS-INVALID"));
});

test("excludes deployment metadata without turning it into a request edge", () => {
  const result = buildSimulationProjection(fixture());
  assert.ok(result.diagnostics.some((item) => item.code === "SIM-RELATION-EXCLUDED" && item.relationIds.includes("api-deploys")));
  assert.ok(!result.topology.edges.some((edge) => edge.sourceRelationIds.includes("api-deploys")));
});

test("blocks invalid numeric parameter ranges", () => {
  const profiles = structuredClone(profilesByEntityId);
  profiles.db.parameters.readFraction = 1.4;
  const result = buildSimulationProjection(fixture({ profilesByEntityId: profiles }));
  assert.equal(result.status, "blocked");
  assert.ok(blockerCodes(result).includes("SIM-PROFILE-PARAMETERS-INVALID"));
});
