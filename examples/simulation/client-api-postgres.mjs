import { buildSimulationProjection } from "../../src/features/simulation/adapter/buildSimulationProjection.js";
import { runSimulation } from "../../src/features/simulation/engine/runSimulation.js";

const entity = (id, kind, name, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId, properties = {}) => ({ id, kind, sourceId, targetId, properties });

const workbench = {
  schemaVersion: 1,
  modelRevision: 7,
  activeViewId: "system",
  views: [{ id: "system", label: "System" }, { id: "data", label: "Data" }],
  viewScenes: {},
  entities: [
    entity("web", "frontend.react-app", "Web client"),
    entity("api", "backend.rest-service", "Checkout API"),
    entity("endpoint", "backend.api-endpoint", "Create checkout", { method: "POST", path: "/checkout" }),
    entity("db", "data.postgresql-database", "Checkout PostgreSQL"),
  ],
  relations: [
    relation("web-calls-endpoint", "calls", "web", "endpoint"),
    relation("api-exposes-endpoint", "exposes", "api", "endpoint"),
    relation("api-reads-db", "reads", "api", "db"),
    relation("api-writes-db", "writes", "api", "db"),
  ],
};
const simulationProfile = {
  schemaVersion: 1,
  profilesByEntityId: {
    web: { kind: "traffic-source", parameters: { trafficRps: 50 } },
    api: { kind: "request-service", parameters: { concurrency: 8, meanServiceMs: 25, serviceTimeCv: 0.2, bufferCapacity: 64, failureProbability: 0, timeoutMs: 0, retryAttempts: 0 } },
    db: { kind: "relational-store", parameters: { concurrency: 6, meanServiceMs: 30, serviceTimeCv: 0.2, bufferCapacity: 32, readFraction: 0.9, writeContentionMs: 15, failureProbability: 0 } },
  },
  defaultScenario: { durationMs: 15000, seed: 211 },
};

const projection = buildSimulationProjection({ workbench, simulationProfile });
if (projection.status !== "ready") {
  console.error(JSON.stringify(projection.diagnostics, null, 2));
  process.exitCode = 1;
} else {
  const experiments = [
    ["baseline", {}],
    ["five-times-traffic", { trafficMultiplier: 5 }],
    ["database-outage", { unavailableNodeIds: ["db"] }],
  ];
  const results = {};
  for (const [name, scenarioOverrides] of experiments) {
    const run = runSimulation({ projection, scenarioOverrides });
    if (run.status !== "completed") {
      console.error(`${name} blocked:`, JSON.stringify(run.diagnostics, null, 2));
      process.exitCode = 1;
      continue;
    }
    results[name] = {
      runFingerprint: run.result.simulation.runFingerprint,
      seed: run.result.simulation.seed,
      trafficMultiplier: run.result.simulation.trafficMultiplier,
      metrics: run.result.metrics,
      perNode: run.result.perNode.map(({ sourceEntityId, kind, utilization, dropped, failed, queueWaitMs }) => ({ sourceEntityId, kind, utilization, dropped, failed, queueWaitMs })),
      bottlenecks: run.result.bottlenecks,
    };
  }
  console.log(JSON.stringify({ note: "Deterministic simulated output from explicit assumptions; not a measurement of a deployed system.", results }, null, 2));
}
