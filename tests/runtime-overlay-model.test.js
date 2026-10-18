import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeOverlayModel, describeRuntimeOverlayNode, runtimeOverlayIsCurrent } from "../src/features/simulation/experiments/runtimeOverlayModel.js";

const workbenchFixture = () => ({
  modelRevision: 4,
  activeViewId: "system",
  entities: [
    { id: "web", kind: "frontend.react-app", name: "React application", properties: {} },
    { id: "api", kind: "backend.rest-service", name: "REST service", properties: { basePath: "/api" } },
    { id: "db", kind: "data.postgresql-database", name: "PostgreSQL", properties: {} },
  ],
  relations: [
    { id: "r1", kind: "calls", sourceId: "web", targetId: "api", properties: {} },
    { id: "r2", kind: "reads", sourceId: "api", targetId: "db", properties: {} },
  ],
});
const snapshotOf = (model) => ({
  modelRevision: model.modelRevision,
  entities: structuredClone(model.entities).sort((a, b) => a.id.localeCompare(b.id)),
  relations: structuredClone(model.relations).sort((a, b) => a.id.localeCompare(b.id)),
});
const createResults = (model) => ({
  status: "completed",
  provenance: { modelRevision: model.modelRevision, scopeEntityIds: ["web", "api", "db"] },
  sourceModelSnapshot: snapshotOf(model),
  runs: {
    trafficSurge: {
      label: "5× traffic",
      result: { status: "completed", result: {
        schemaVersion: 2,
        simulation: { runFingerprint: "run-5x" },
        metrics: { offeredRequests: 750, observationWindowMs: 15000 },
        timeSeries: { source: "discrete-event-timestamps", observationWindowMs: 15000, points: [{ offeredRequests: 750 }] },
        requestTraces: { traces: [{ requestId: "request-42", outcome: "success", hops: [
          { entityId: "web", kind: "traffic-source", label: "React application" },
          { entityId: "api", kind: "request-service", label: "REST service" },
          { entityId: "db", kind: "relational-store", label: "PostgreSQL" },
        ] }] },
        perNode: [
          { sourceEntityId: "api", kind: "request-service", utilization: 0.8, arrivals: 650, failed: 1, dropped: 12, queueWaitMs: { p95: 4.5 }, serviceTimeMs: { p95: 25 } },
          { sourceEntityId: "db", kind: "relational-store", utilization: 0.997, arrivals: 630, failed: 0, dropped: 810, queueWaitMs: { p95: 18 }, serviceTimeMs: { p95: 30 } },
        ],
      } },
    },
    outage: { label: "PostgreSQL unavailable", result: { status: "blocked", result: null } },
  },
});

test("builds canvas overlays from the selected completed scenario and engine-derived values", () => {
  const workbench = workbenchFixture();
  const overlay = buildRuntimeOverlayModel({ results: createResults(workbench), activeRunKey: "trafficSurge", workbench, activeViewId: "system" });
  assert.equal(overlay.scenarioLabel, "5× traffic");
  assert.equal(overlay.runFingerprint, "run-5x");
  assert.equal(overlay.nodes.length, 3);
  assert.deepEqual(overlay.nodes.map((node) => node.entityId), ["web", "api", "db"]);
  assert.equal(overlay.nodes[0].offeredRps, 50);
  assert.equal(overlay.nodes.find((node) => node.entityId === "db").dropped, 810);
});

test("does not show overlays for stale, revision-mismatched, missing, or blocked results", () => {
  const workbench = workbenchFixture();
  const results = createResults(workbench);
  assert.equal(buildRuntimeOverlayModel({ results, activeRunKey: "trafficSurge", workbench, activeViewId: "system", stale: true }), null);
  assert.equal(buildRuntimeOverlayModel({ results: { ...results, provenance: { modelRevision: 3 } }, activeRunKey: "trafficSurge", workbench, activeViewId: "system" }), null);
  assert.equal(buildRuntimeOverlayModel({ results, activeRunKey: "outage", workbench, activeViewId: "system" }), null);
  assert.equal(buildRuntimeOverlayModel({ results: null, activeRunKey: "trafficSurge", workbench, activeViewId: "system" }), null);
});

test("hides overlays when the semantic model differs even if its revision number matches", () => {
  const workbench = workbenchFixture();
  const results = createResults(workbench);
  const changed = { ...workbench, entities: workbench.entities.map((entity) => entity.id === "db" ? { ...entity, name: "Renamed database" } : entity) };
  assert.equal(buildRuntimeOverlayModel({ results, activeRunKey: "trafficSurge", workbench: changed, activeViewId: "system" }), null);
  assert.equal(runtimeOverlayIsCurrent(buildRuntimeOverlayModel({ results, activeRunKey: "trafficSurge", workbench, activeViewId: "system" }), changed, "system"), false);
});

test("overlay freshness requires the active view that produced the run", () => {
  const workbench = workbenchFixture();
  const overlay = buildRuntimeOverlayModel({ results: createResults(workbench), activeRunKey: "trafficSurge", workbench, activeViewId: "system" });
  assert.equal(runtimeOverlayIsCurrent(overlay, workbench, "system"), true);
  assert.equal(runtimeOverlayIsCurrent(overlay, { ...workbench, activeViewId: "data" }, "data"), false);
  assert.equal(runtimeOverlayIsCurrent(overlay, workbench, "apis"), false);
});

test("labels pressure and failures from real node metrics without claiming all clear", () => {
  assert.deepEqual(describeRuntimeOverlayNode({ kind: "relational-store", utilization: 0.997, dropped: 810, failed: 0 }), {
    tone: "pressure", statusLabel: "CAPACITY PRESSURE", detail: "99.7% busy · 810 dropped",
  });
  assert.match(describeRuntimeOverlayNode({ kind: "request-service", utilization: 0.91, dropped: 0, failed: 3 }).statusLabel, /FAILURES OBSERVED/);
  assert.match(describeRuntimeOverlayNode({ kind: "request-service", utilization: 0.2, dropped: 0, failed: 0 }).statusLabel, /NO PRESSURE SIGNAL/);
  assert.match(describeRuntimeOverlayNode({ kind: "traffic-source", offeredRps: 49.6 }).detail, /49.6 req\/s offered/);
});


test("overlay highlights only the entity hop validated against the retained selected trace", () => {
  const workbench = workbenchFixture();
  const results = createResults(workbench);
  const investigation = { scenarioKey: "trafficSurge", requestId: "request-42", hopIndex: 2, entityId: "db", reason: "largest-measured-hop-duration" };
  const overlay = buildRuntimeOverlayModel({ results, activeRunKey: "trafficSurge", workbench, activeViewId: "system", investigation });
  assert.deepEqual(overlay.traceFocus, {
    requestId: "request-42", entityId: "db", hopIndex: 2, componentLabel: "PostgreSQL", reason: "largest-measured-hop-duration", startMs: null, endMs: null,
  });
  const mismatched = buildRuntimeOverlayModel({ results, activeRunKey: "baseline", workbench, activeViewId: "system", investigation });
  assert.equal(mismatched, null);
  const invalidHop = buildRuntimeOverlayModel({ results, activeRunKey: "trafficSurge", workbench, activeViewId: "system", investigation: { ...investigation, entityId: "api" } });
  assert.equal(invalidHop.traceFocus, null);
});
