import test from "node:test";
import assert from "node:assert/strict";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";
import { createWorkbenchExtension, readWorkbenchDocument, withWorkbenchExtension, WORKBENCH_EXTENSION_KEY } from "../src/features/workbench/workbenchDocument.js";
import { createIllustrativeSimulationProfile, markSimulationAssumptionsConfirmed } from "../src/features/simulation/experiments/simulationExperimentModel.js";

const modelEntity = (id, kind, name) => ({ id, kind, name, properties: {} });

test("simulation profiles round-trip inside Workbench metadata without changing scene elements", () => {
  let workbench = createWorkbenchExtension({
    activeViewId: "system",
    modelRevision: 4,
    views: [{ id: "system", label: "System" }, { id: "data", label: "Data" }],
    viewScenes: { data: { elements: [], appState: {}, files: {} } },
    entities: [modelEntity("web", "frontend.react-app", "Web"), modelEntity("api", "backend.rest-service", "API"), modelEntity("db", "data.postgresql-database", "DB")],
    relations: [],
  });
  workbench.simulationProfile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench));
  workbench.simulationProfile.loadTestEvidence = {
    schemaVersion: 1,
    records: [{
      schemaVersion: 1, id: "load-test-doc-roundtrip", name: "Sustained load", testedAt: "2026-10-18",
      targetEnvironment: "staging-api-tier-a", source: "k6", workload: { durationSeconds: 60, offeredRps: 50, concurrency: 100 },
      observed: { throughputRps: 48, p95LatencyMs: 82, errorRatePercent: 0.2, appCpuPercent: 65, appMemoryGb: 1.4, dbCpuPercent: 42, dbConnections: 24, dbP95QueryMs: 18,
        restExclusiveMeanServiceMs: null, restServiceSampleCount: null, dbMeanQueryServiceMs: null, dbServiceSampleCount: null }, notes: "Measured from the staging run.",
    }],
  };
  const elements = [{ id: "freeform-note", type: "text", text: "do not alter me", x: 10, y: 20, width: 120, height: 20 }];
  const drawing = parseDrawing(serializeDrawing({
    format: "sketchizi", elements, appState: {}, files: {}, metadata: { title: "Persist simulation assumptions" },
    extensions: withWorkbenchExtension({ "com.example.unknown": { preserve: true } }, workbench),
  }));
  const reopened = readWorkbenchDocument(drawing);
  const restoredProfile = reopened.workbench.simulationProfile;
  assert.equal(restoredProfile.profileKind, "user-confirmed-synthetic");
  assert.equal(restoredProfile.profilesByEntityId.web.parameters.trafficRps, 50);
  assert.equal(restoredProfile.profilesByEntityId.api.parameters.meanServiceMs, 25);
  assert.equal(restoredProfile.profilesByEntityId.api.assumptions.meanServiceMs.status, "user-confirmed");
  assert.equal(restoredProfile.infrastructureByEntityId.api.fields.replicaCount.value, null);
  assert.equal(restoredProfile.infrastructureByEntityId.api.fields.replicaCount.evidence, "unknown");
  assert.equal(restoredProfile.infrastructureByEntityId.db.fields.maxConnections.value, null);
  assert.equal(restoredProfile.loadTestEvidence.records[0].targetEnvironment, "staging-api-tier-a");
  assert.equal(restoredProfile.loadTestEvidence.records[0].observed.throughputRps, 48);
  assert.deepEqual(reopened.activeScene.elements, elements);
  assert.deepEqual(drawing.extensions["com.example.unknown"], { preserve: true });
  assert.ok(drawing.extensions[WORKBENCH_EXTENSION_KEY]);
});

