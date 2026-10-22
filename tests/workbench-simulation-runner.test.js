import test from "node:test";
import assert from "node:assert/strict";
import { runWorkbenchExperiments, runTrafficSweep, runResilienceMatrix, runFailureChainMatrix, WORKBENCH_SIMULATION_RUNNER_VERSION } from "../src/features/simulation/runWorkbenchExperiments.js";
import {
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
  compareSimulationRuns,
} from "../src/features/simulation/experiments/simulationExperimentModel.js";

const entity = (id, kind, name = id, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId, properties = {}) => ({ id, kind, sourceId, targetId, properties });
function makeWorkbench() {
  return {
    schemaVersion: 1,
    modelRevision: 19,
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
}
function confirmedProfile(workbench) {
  return markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 10000, seed: 20261017 }));
}

 test("end-to-end Workbench -> SimIR -> baseline/surge/outage runs are complete and explainable", () => {
  const workbench = makeWorkbench();
  const profile = confirmedProfile(workbench);
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics, null, 2));
  assert.equal(suite.provenance.runnerVersion, WORKBENCH_SIMULATION_RUNNER_VERSION);
  assert.equal(suite.provenance.modelRevision, 19);
  assert.ok(suite.provenance.modelFingerprint);
  assert.ok(suite.provenance.profileFingerprint);
  assert.deepEqual(suite.scenarioKeys, ["baseline", "trafficSurge", "outage"]);
  for (const key of suite.scenarioKeys) {
    assert.equal(suite.runs[key].result.status, "completed", `${key} did not complete`);
    assert.ok(suite.runs[key].result.result.simulation.runFingerprint);
  }
  assert.equal(suite.runs.outage.targetEntityId, "db");
  assert.equal(suite.runs.outage.result.result.metrics.successfulRequests, 0);
  assert.ok(suite.runs.trafficSurge.result.result.metrics.offeredRequests > suite.runs.baseline.result.result.metrics.offeredRequests);
  assert.ok(suite.runs.trafficSurge.explanations.length > 0);
  assert.ok(suite.runs.trafficSurge.explanations.some((finding) => finding.entityIds.includes("db")));
  assert.equal(compareSimulationRuns(suite.runs.baseline.result, suite.runs.trafficSurge.result).status, "ready");
});

test("same workbench/profile produces repeatable metrics and fingerprints through the public runner", () => {
  const workbench = makeWorkbench();
  const profile = confirmedProfile(workbench);
  const first = runWorkbenchExperiments({ workbench, simulationProfile: profile });
  const second = runWorkbenchExperiments({ workbench, simulationProfile: profile });
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  for (const key of first.scenarioKeys) {
    assert.deepEqual(first.runs[key].result.result, second.runs[key].result.result);
    assert.equal(first.runs[key].result.result.simulation.runFingerprint, second.runs[key].result.result.simulation.runFingerprint);
  }
});

test("proposed, unconfirmed synthetic assumptions block all execution", () => {
  const workbench = makeWorkbench();
  const profile = createIllustrativeSimulationProfile(workbench, { durationMs: 10000, seed: 7 });
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile });
  assert.equal(suite.status, "blocked");
  assert.deepEqual(suite.runs, {});
  assert.ok(suite.diagnostics.some((item) => item.code === "SIM-ASSUMPTION-UNCONFIRMED"));
});

test("invalid multiplier blocks before creating experiment runs", () => {
  const workbench = makeWorkbench();
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: confirmedProfile(workbench), trafficMultiplier: 1 });
  assert.equal(suite.status, "blocked");
  assert.deepEqual(suite.runs, {});
  assert.ok(suite.diagnostics.some((item) => item.code === "RUNNER-TRAFFIC-MULTIPLIER-INVALID"));
});

test("unsupported explicitly requested outage target is reported without pretending it ran", () => {
  const workbench = makeWorkbench();
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: confirmedProfile(workbench), outageTargetEntityId: "checkout-endpoint" });
  assert.equal(suite.status, "partial");
  assert.equal(suite.runs.outage, undefined);
  assert.ok(suite.diagnostics.some((item) => item.code === "RUNNER-OUTAGE-TARGET-UNSUPPORTED"));
});

test("blocked malformed model propagates diagnostics and never calls a scenario", () => {
  const suite = runWorkbenchExperiments({ workbench: { schemaVersion: 1, entities: [], relations: [] }, simulationProfile: { schemaVersion: 1, profilesByEntityId: {}, defaultScenario: { durationMs: 10000, seed: 9 } } });
  assert.equal(suite.status, "blocked");
  assert.deepEqual(suite.runs, {});
  assert.ok(suite.diagnostics.some((item) => item.severity === "blocker"));
});


test("active-view simulation scope ignores unrelated runtime components from other views", () => {
  const workbench = makeWorkbench();
  workbench.entities.push(entity("external", "integrations.external-api", "Unused payment API"));
  workbench.relations.push(relation("api-depends-external", "depends-on", "api", "external"));
  const profile = confirmedProfile(workbench);
  const suite = runWorkbenchExperiments({ workbench, simulationProfile: profile, scopeEntityIds: ["web", "api", "db"] });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics, null, 2));
  assert.ok(!suite.provenance.scopeEntityIds.includes("external"));
  assert.ok(suite.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE" && item.entityIds.includes("external")));
  assert.ok(!suite.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION"));
});

test("a connected External API remains runnable after synthetic assumptions are confirmed", () => {
  const workbench = makeWorkbench();
  workbench.entities = workbench.entities.filter((item) => item.id !== "db");
  workbench.relations = workbench.relations.filter((item) => item.sourceId !== "db" && item.targetId !== "db");
  workbench.entities.push(entity("external", "integrations.external-api", "Payment provider"));
  workbench.relations.push(relation("api-calls-external", "calls", "api", "external"));
  const profile = confirmedProfile(workbench);
  const suite = runWorkbenchExperiments({
    workbench,
    simulationProfile: profile,
    scopeEntityIds: ["web", "checkout-endpoint", "api", "external"],
  });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics, null, 2));
  assert.ok(suite.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION" && item.severity === "warning"));
  assert.ok(Object.values(suite.runs).every((run) => run.result.status === "completed"), "the approximation warning itself is not a blocker");
});

test("runner skips a disconnected External API even when its placement and profile are in the active view", () => {
  const workbench = makeWorkbench();
  workbench.entities.push(entity("external", "integrations.external-api", "Unused payment API"));
  workbench.relations.push(relation("api-depends-external", "depends-on", "api", "external"));
  const profile = confirmedProfile(workbench);
  const suite = runWorkbenchExperiments({
    workbench,
    simulationProfile: profile,
    scopeEntityIds: ["web", "checkout-endpoint", "api", "db", "external"],
  });
  assert.equal(suite.status, "completed", JSON.stringify(suite.diagnostics, null, 2));
  assert.ok(suite.provenance.scopeSeedEntityIds.includes("external"));
  assert.ok(!suite.provenance.scopeEntityIds.includes("external"));
  assert.ok(suite.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE" && item.entityIds.includes("external")));
  assert.ok(!suite.diagnostics.some((item) => item.code === "SIM-EXTERNAL-APPROXIMATION"));
  assert.ok(Object.values(suite.runs).every((run) => run.result.status === "completed"));
});

test("engine blockers are surfaced at suite level with semantic component references", () => {
  const workbench = makeWorkbench();
  const noTypedLinks = { ...workbench, relations: [] };
  const suite = runWorkbenchExperiments({ workbench: noTypedLinks, simulationProfile: confirmedProfile(noTypedLinks), scopeEntityIds: ["web", "api", "db"] });
  assert.equal(suite.status, "blocked");
  const routeBlockers = suite.diagnostics.filter((item) => item.code === "ENGINE-TRAFFIC-ROUTE-INVALID");
  assert.ok(routeBlockers.length > 0, JSON.stringify(suite.diagnostics, null, 2));
  assert.ok(routeBlockers.every((item) => item.entityIds?.includes("web")), "engine node IDs should map to Workbench entity IDs for focus actions");
  assert.ok(suite.diagnostics.some((item) => item.code === "SIM-OUTSIDE-ACTIVE-SCOPE" && item.entityIds.includes("api") && item.entityIds.includes("db")), "disconnected runtime components should be explained rather than silently included");
});


test("traffic sweep returns ordered deterministic points with explicit synthetic SLO classification", () => {
  const workbench = makeWorkbench();
  const profile = confirmedProfile(workbench);
  const options = {
    workbench,
    simulationProfile: profile,
    multipliers: [1, 2, 3, 5],
    maxP95LatencyMs: 100000,
    maxErrorRatePercent: 100,
  };
  const first = runTrafficSweep(options);
  const second = runTrafficSweep(options);
  assert.equal(first.status, "completed", JSON.stringify(first.diagnostics, null, 2));
  assert.deepEqual(first.points.map((point) => point.multiplier), [1, 2, 3, 5]);
  assert.ok(first.points.every((point) => point.status === "completed"));
  assert.ok(first.points.every((point) => point.sloStatus === "pass"));
  assert.ok(first.points.every((point) => point.sloBudget?.evaluated === true));
  assert.ok(first.points.every((point) => Number.isFinite(point.sloBudget.latencyHeadroomMs)));
  assert.ok(first.points.every((point) => Number.isFinite(point.sloBudget.errorBudgetRemainingPercent)));
  assert.ok(first.points[0].sloBudget.errorBudgetStatus === "within-budget");
  assert.ok(first.points[1].metrics.offeredRequests > first.points[0].metrics.offeredRequests);
  assert.deepEqual(first.points.map((point) => point.result.result), second.points.map((point) => point.result.result));
  assert.equal(first.lastPassingMultiplier, 5);
  assert.equal(first.firstFailureMultiplier, null);
  assert.match(first.interpretation, /does not prove/i);
});

test("traffic sweep leaves SLO status unevaluated until both targets are supplied", () => {
  const workbench = makeWorkbench();
  const result = runTrafficSweep({ workbench, simulationProfile: confirmedProfile(workbench), multipliers: [1, 2] });
  assert.equal(result.status, "completed");
  assert.ok(result.points.every((point) => point.sloStatus === "targets-not-set"));
  assert.equal(result.targets, null);
  assert.match(result.interpretation, /Set both SLO targets/);
});

test("traffic sweep rejects duplicate or invalid load multipliers", () => {
  const workbench = makeWorkbench();
  const result = runTrafficSweep({ workbench, simulationProfile: confirmedProfile(workbench), multipliers: [1, 2, 2] });
  assert.equal(result.status, "blocked");
  assert.ok(result.diagnostics.some((item) => item.code === "TRAFFIC-SWEEP-MULTIPLIERS-INVALID"));
  assert.deepEqual(result.points, []);
});

test("traffic sweep identifies the first sampled SLO failure without interpolating capacity", () => {
  const workbench = makeWorkbench();
  const result = runTrafficSweep({
    workbench,
    simulationProfile: confirmedProfile(workbench),
    multipliers: [1, 2, 3, 5, 8],
    maxP95LatencyMs: 0.1,
    maxErrorRatePercent: 0,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.firstFailureMultiplier, 1);
  assert.equal(result.lastPassingMultiplier, null);
  assert.match(result.interpretation, /actual failure threshold lies somewhere between tested points/);
});


test("resilience matrix runs deterministic single-component outages and ranks throughput impact", () => {
  const workbench = makeWorkbench();
  const profile = confirmedProfile(workbench);
  const options = { workbench, simulationProfile: profile };
  const first = runResilienceMatrix(options);
  const second = runResilienceMatrix(options);
  assert.equal(first.status, "completed", JSON.stringify(first.diagnostics, null, 2));
  assert.ok(first.scenarios.some((scenario) => scenario.id === "api"));
  assert.ok(first.scenarios.some((scenario) => scenario.id === "db"));
  assert.ok(first.scenarios.every((scenario) => scenario.status === "completed"));
  assert.ok(first.scenarios.every((scenario) => Number.isFinite(scenario.metrics?.offeredRequests)));
  assert.deepEqual(first.scenarios.map((scenario) => scenario.id), second.scenarios.map((scenario) => scenario.id));
  assert.deepEqual(first.scenarios.map((scenario) => scenario.result.result), second.scenarios.map((scenario) => scenario.result.result));
  assert.match(first.interpretation, /synthetic/i);
});

test("resilience matrix rejects invalid traffic multiplier", () => {
  const workbench = makeWorkbench();
  const result = runResilienceMatrix({ workbench, simulationProfile: confirmedProfile(workbench), trafficMultiplier: 0 });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.scenarios, []);
  assert.ok(result.diagnostics.some((item) => item.code === "RESILIENCE-MATRIX-TRAFFIC-INVALID"));
});


test("failure-chain matrix evaluates deterministic pairs and compares combined impact with individual outages", () => {
  const workbench = makeWorkbench();
  const options = { workbench, simulationProfile: confirmedProfile(workbench) };
  const first = runFailureChainMatrix(options);
  const second = runFailureChainMatrix(options);
  assert.equal(first.status, "completed", JSON.stringify(first.diagnostics, null, 2));
  assert.equal(first.totalPairCount, 1);
  assert.equal(first.evaluatedPairCount, 1);
  assert.equal(first.scenarios[0].targets.length, 2);
  assert.ok(["worse-than-either-alone", "less-impact-than-strongest-alone", "similar-to-strongest-alone", "not-comparable"].includes(first.scenarios[0].interaction));
  assert.deepEqual(first.scenarios.map((item) => item.result.result), second.scenarios.map((item) => item.result.result));
  assert.match(first.interpretation, /synthetic what-if/i);
});

test("failure-chain matrix rejects invalid load and pair limits", () => {
  const workbench = makeWorkbench();
  const profile = confirmedProfile(workbench);
  const invalidTraffic = runFailureChainMatrix({ workbench, simulationProfile: profile, trafficMultiplier: 0 });
  assert.equal(invalidTraffic.status, "blocked");
  assert.ok(invalidTraffic.diagnostics.some((item) => item.code === "FAILURE-CHAIN-TRAFFIC-INVALID"));
  const invalidPairs = runFailureChainMatrix({ workbench, simulationProfile: profile, maxPairs: 0 });
  assert.equal(invalidPairs.status, "blocked");
  assert.ok(invalidPairs.diagnostics.some((item) => item.code === "FAILURE-CHAIN-PAIR-LIMIT-INVALID"));
});

test("failure-chain matrix blocks when fewer than two outage candidates exist", () => {
  const workbench = makeWorkbench();
  workbench.entities = workbench.entities.filter((item) => item.id !== "db");
  workbench.relations = workbench.relations.filter((item) => !item.targetId.includes("db"));
  const result = runFailureChainMatrix({ workbench, simulationProfile: confirmedProfile(workbench) });
  assert.equal(result.status, "blocked");
  assert.ok(result.diagnostics.some((item) => item.code === "FAILURE-CHAIN-NEEDS-TWO-TARGETS"));
});
