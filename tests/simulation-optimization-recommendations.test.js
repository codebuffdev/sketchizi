import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIllustrativeSimulationProfile, recommendSimulationImprovements } from "../src/features/simulation/experiments/simulationExperimentModel.js";

const workbench = {
  modelRevision: 4,
  entities: [
    { id: "web", kind: "frontend.react-app", name: "Web" },
    { id: "api", kind: "backend.rest-service", name: "API" },
    { id: "db", kind: "data.postgresql-database", name: "PostgreSQL", properties: { schema: "public" } },
    { id: "orders", kind: "data.postgresql-table", name: "orders", properties: { tableName: "orders", columns: JSON.stringify([{ name: "customer_id" }, { name: "id", primaryKey: true }]), indexes: "[]" } },
  ],
  relations: [
    { id: "r1", kind: "writes", sourceId: "api", targetId: "db" },
    { id: "r2", kind: "reads", sourceId: "api", targetId: "db" },
    { id: "r3", kind: "contains-table", sourceId: "db", targetId: "orders" },
  ],
};

function completedRun(overrides = {}) {
  return {
    status: "completed",
    result: { status: "completed", result: { perNode: [
      { sourceEntityId: "api", utilization: 0.96, dropped: 12, failed: 1, queueWaitMs: { p95: 18 }, serviceTimeMs: { p95: 30 } },
      { sourceEntityId: "db", utilization: 0.88, dropped: 2, failed: 0, queueWaitMs: { p95: 6 }, serviceTimeMs: { p95: 45 }, readOperationsStarted: 90, indexedReadOperationsStarted: 0, indexAssumedTimeSavedMsTotal: 0, writeOperationsStarted: 35, writeContentionMsTotal: 420 },
    ], ...overrides } },
  };
}

test("recommendations prioritize observed drops and include only evidence-eligible interventions", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  const recommendations = recommendSimulationImprovements({ run: completedRun(), profile, workbench, scopeEntityIds: ["web", "api", "db"] });
  assert.ok(recommendations.length > 0);
  assert.equal(recommendations[0].interventionKind, "capacity");
  assert.equal(recommendations[0].entityId, "api");
  assert.ok(recommendations.some((item) => item.interventionKind === "service-time" && item.entityId === "db"));
  assert.ok(recommendations.some((item) => item.interventionKind === "write-contention" && item.entityId === "db"));
  assert.ok(recommendations.some((item) => item.interventionKind === "database-index" && item.columnName === "customer_id"));
  assert.deepEqual(recommendations.map((item) => item.rank), recommendations.map((_, index) => index + 1));
});

test("recommendations respect scope and return no recommendations for incomplete runs", () => {
  const profile = createIllustrativeSimulationProfile(workbench);
  const scoped = recommendSimulationImprovements({ run: completedRun(), profile, workbench, scopeEntityIds: ["api"] });
  assert.ok(scoped.every((item) => item.entityId === "api"));
  assert.equal(recommendSimulationImprovements({ run: { status: "blocked", result: { status: "blocked" } }, profile, workbench }).length, 0);
});

test("recommendation panel runs the selected intervention and describes evidence limits", async () => {
  const panel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /recommendSimulationImprovements\(/);
  assert.match(panel, /RECOMMENDED NEXT EXPERIMENTS/);
  assert.match(panel, /runImprovementExperiment\(recommendation\.interventionKind, recommendation\)/);
  assert.match(panel, /not automatic production fixes/);
});
