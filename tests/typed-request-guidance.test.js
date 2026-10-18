import test from "node:test";
import assert from "node:assert/strict";
import { getTypedRequestGuidance } from "../src/features/simulation/experiments/typedRequestGuidance.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";
import { createIllustrativeSimulationProfile, markSimulationAssumptionsConfirmed } from "../src/features/simulation/experiments/simulationExperimentModel.js";

const entity = (id, kind, name = id) => ({ id, kind, name, properties: {} });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, properties: {} });
function makeWorkbench() {
  return {
    schemaVersion: 1,
    modelRevision: 1,
    activeViewId: "system",
    entities: [
      entity("web", "frontend.react-app", "React application"),
      entity("api", "backend.rest-service", "REST service"),
      entity("db", "data.postgresql-database", "PostgreSQL"),
    ],
    relations: [],
  };
}

test("guidance explains both missing semantic links for the common SaaS path", () => {
  const model = makeWorkbench();
  const guide = getTypedRequestGuidance(model, ["web", "api", "db"]);
  assert.ok(guide);
  assert.equal(guide.missingLinks.length, 2);
  assert.match(guide.missingLinks[0].title, /React application — Calls → REST service/);
  assert.equal(guide.missingLinks[0].focusEntityId, "web");
  assert.equal(guide.missingLinks[0].relationKind, "calls");
  assert.equal(guide.missingLinks[0].canCreate, true);
  assert.match(guide.missingLinks[1].title, /REST service — Reads from \/ Writes to → PostgreSQL/);
  assert.equal(guide.missingLinks[1].focusEntityId, "api");
  assert.equal(guide.missingLinks[1].relationKind, "reads");
  assert.equal(guide.missingLinks[1].alternativeRelationKind, "writes");
});

test("ordinary drawing arrows cannot satisfy semantic connection guidance", () => {
  const model = makeWorkbench();
  // Excalidraw scene elements are deliberately not input to this helper.
  model.viewScenes = { system: { elements: [{ type: "arrow", x: 0, y: 0, width: 100, height: 20 }] } };
  const guide = getTypedRequestGuidance(model, ["web", "api", "db"]);
  assert.deepEqual(guide.missingLinks.map((item) => item.id), ["client-calls-service", "service-accesses-database"]);
});

test("guidance disappears when the typed call and database access exist", () => {
  const model = makeWorkbench();
  model.relations = [relation("r1", "calls", "web", "api"), relation("r2", "reads", "api", "db")];
  assert.equal(getTypedRequestGuidance(model, ["web", "api", "db"]), null);
});

test("guidance recognizes a React call to an endpoint exposed by the REST service", () => {
  const model = makeWorkbench();
  model.entities.push(entity("endpoint", "backend.api-endpoint", "GET /items"));
  model.relations = [
    relation("exposes", "exposes", "api", "endpoint"),
    relation("calls", "calls", "web", "endpoint"),
  ];
  const guide = getTypedRequestGuidance(model, ["web", "api", "db", "endpoint"]);
  assert.deepEqual(guide.missingLinks.map((item) => item.id), ["service-accesses-database"]);
});

test("runner explains missing typed request path and excluded outage target", () => {
  const model = makeWorkbench();
  const profile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(model, { durationMs: 5000, seed: 23 }));
  const suite = runWorkbenchExperiments({ workbench: model, simulationProfile: profile, scopeEntityIds: ["web", "api", "db"] });
  assert.equal(suite.status, "blocked");
  assert.ok(suite.diagnostics.some((item) => item.code === "RUNNER-TYPED-REQUEST-PATH-MISSING" && /ordinary canvas arrows/i.test(item.message)));
  assert.ok(suite.diagnostics.some((item) => item.code === "RUNNER-OUTAGE-TARGET-OUTSIDE-TYPED-PATH" && item.entityIds.includes("db")));
});


test("guidance remains visible when the active-view placement snapshot is unavailable", () => {
  const model = makeWorkbench();
  const guide = getTypedRequestGuidance(model, []);
  assert.ok(guide, "global unique candidates still explain which links are needed");
  assert.deepEqual(guide.missingLinks.map((item) => item.id), ["client-calls-service", "service-accesses-database"]);
  assert.ok(guide.missingLinks.every((item) => item.canCreate === false), "must not create relations until endpoints are confirmed in the active view");
});
