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
  assert.deepEqual(reopened.activeScene.elements, elements);
  assert.deepEqual(drawing.extensions["com.example.unknown"], { preserve: true });
  assert.ok(drawing.extensions[WORKBENCH_EXTENSION_KEY]);
});

