import test from "node:test";
import assert from "node:assert/strict";
import { deriveTraceInvestigation, findTraceWindowBucketRange } from "../src/features/simulation/experiments/traceInvestigation.js";

const trace = (overrides = {}) => ({
  requestId: "request-0000042",
  outcome: "success",
  hops: [
    { entityId: "web", label: "React application", kind: "traffic-source", arrivalMs: 20, outcomeAtMs: 20, outcome: "sent" },
    { entityId: "api", label: "REST service", kind: "request-service", arrivalMs: 20, queueWaitMs: 3, serviceTimeMs: 14, serviceStartedAtMs: 23, outcomeAtMs: 37, outcome: "completed" },
    { entityId: "db", label: "PostgreSQL", kind: "relational-store", arrivalMs: 37, queueWaitMs: 22, serviceTimeMs: 41, serviceStartedAtMs: 59, outcomeAtMs: 100, outcome: "success" },
  ],
  ...overrides,
});

test("successful trace investigation selects the hop with the largest recorded queue plus service time", () => {
  const selected = deriveTraceInvestigation(trace());
  assert.equal(selected.entityId, "db");
  assert.equal(selected.componentLabel, "PostgreSQL");
  assert.equal(selected.durationMs, 63);
  assert.equal(selected.startMs, 37);
  assert.equal(selected.endMs, 100);
  assert.equal(selected.reason, "largest-measured-hop-duration");
  assert.equal(selected.hasTimeWindow, true);
});

test("failed trace investigation focuses the recorded failure point rather than claiming an unmeasured cause", () => {
  const sample = trace({
    outcome: "failed",
    hops: [
      { entityId: "web", kind: "traffic-source", arrivalMs: 20, outcomeAtMs: 20, outcome: "sent" },
      { entityId: "api", kind: "request-service", arrivalMs: 20, queueWaitMs: 4, serviceTimeMs: 15, serviceStartedAtMs: 24, outcomeAtMs: 39, outcome: "completed" },
      { entityId: "db", label: "PostgreSQL", kind: "relational-store", arrivalMs: 39, queueWaitMs: null, serviceTimeMs: null, serviceStartedAtMs: null, outcomeAtMs: 39, outcome: "unavailable" },
    ],
  });
  const selected = deriveTraceInvestigation(sample);
  assert.equal(selected.entityId, "db");
  assert.equal(selected.reason, "request-problem-point");
  assert.equal(selected.durationMs, null);
  assert.equal(selected.hopOutcome, "unavailable");
});

test("time-series range returns only buckets overlapping a recorded trace-hop window", () => {
  const points = Array.from({ length: 5 }, (_, index) => ({ startMs: index * 10, endMs: (index + 1) * 10 }));
  assert.deepEqual(findTraceWindowBucketRange(points, { hasTimeWindow: true, startMs: 23, endMs: 42 }), { startIndex: 2, endIndex: 4 });
  assert.equal(findTraceWindowBucketRange(points, { hasTimeWindow: false, startMs: null, endMs: null }), null);
  assert.equal(findTraceWindowBucketRange(points, { hasTimeWindow: true, startMs: 60, endMs: 70 }), null);
});
