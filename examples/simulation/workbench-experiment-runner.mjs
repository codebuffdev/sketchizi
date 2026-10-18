import { runWorkbenchExperiments } from "../../src/features/simulation/runWorkbenchExperiments.js";
import {
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
} from "../../src/features/simulation/experiments/simulationExperimentModel.js";

const entity = (id, kind, name, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId, properties = {}) => ({ id, kind, sourceId, targetId, properties });
const workbench = {
  schemaVersion: 1,
  modelRevision: 1,
  activeViewId: "system",
  views: [{ id: "system", label: "System" }, { id: "apis", label: "APIs" }, { id: "data", label: "Data" }],
  viewScenes: {},
  entities: [
    entity("web", "frontend.react-app", "React storefront"),
    entity("api", "backend.rest-service", "Spring Boot checkout"),
    entity("checkout-endpoint", "backend.api-endpoint", "Create checkout", { method: "POST", path: "/checkout" }),
    entity("db", "data.postgresql-database", "PostgreSQL"),
  ],
  relations: [
    relation("web-calls-checkout", "calls", "web", "checkout-endpoint"),
    relation("api-exposes-checkout", "exposes", "api", "checkout-endpoint"),
    relation("api-reads-db", "reads", "api", "db"),
    relation("api-writes-db", "writes", "api", "db"),
  ],
};

const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 10000, seed: 20261017 }));
const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile });
if (suite.status !== "completed") {
  console.error(JSON.stringify({ status: suite.status, diagnostics: suite.diagnostics }, null, 2));
  process.exitCode = 1;
} else {
  const compact = Object.fromEntries(Object.entries(suite.runs).map(([key, run]) => {
    const metrics = run.result.result.metrics;
    return [key, {
      label: run.label,
      status: run.result.status,
      offeredRequests: metrics.offeredRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      droppedRequests: metrics.droppedRequests,
      throughputRps: metrics.throughputRps,
      successfulP95LatencyMs: metrics.successfulLatencyMs?.p95,
      runFingerprint: run.result.result.simulation.runFingerprint,
      explanations: run.explanations.map(({ kind, title, entityIds }) => ({ kind, title, entityIds })),
    }];
  }));
  console.log(JSON.stringify({ status: suite.status, provenance: suite.provenance, runs: compact }, null, 2));
}
