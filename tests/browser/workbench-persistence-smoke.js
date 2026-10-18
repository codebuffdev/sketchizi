import { loadRecentSketch, loadSketch, saveEmergencyBackup, saveRecentSketch, saveSketch } from "../../src/persistence.js";
import { parseDrawing, serializeDrawing } from "../../src/fileSystem.js";
import { createWorkbenchExtension, withWorkbenchExtension, WORKBENCH_EXTENSION_KEY } from "../../src/features/workbench/workbenchDocument.js";
import { runWorkbenchExperiments } from "../../src/features/simulation/runWorkbenchExperiments.js";
import { createIllustrativeSimulationProfile, markSimulationAssumptionsConfirmed } from "../../src/features/simulation/experiments/simulationExperimentModel.js";
import { appendSimulationHistory, createSimulationHistoryEntry, restoreSimulationHistoryEntry, simulationResultsAreStale } from "../../src/features/simulation/experiments/simulationHistory.js";

const status = document.querySelector("#status");
const details = document.querySelector("#details");
const results = [];
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`);
};
const equalsJson = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const workbench = createWorkbenchExtension({
  activeViewId: "system",
  modelRevision: 9,
  entities: [
    { id: "ui-1", kind: "frontend.react-app", name: "Web UI", properties: {} },
    { id: "api-1", kind: "backend.rest-service", name: "API", properties: { port: 8080 } },
    { id: "db-1", kind: "data.postgresql-database", name: "Primary DB", properties: {} },
  ],
  relations: [
    { id: "rel-1", kind: "calls", sourceId: "ui-1", targetId: "api-1" },
    { id: "rel-2", kind: "reads", sourceId: "api-1", targetId: "db-1" },
  ],
  views: [{ id: "system", kind: "system", title: "System" }, { id: "apis", kind: "apis", title: "APIs" }],
  viewScenes: {
    apis: {
      elements: [{ id: "api-placement", type: "rectangle", x: 80, y: 40, width: 120, height: 60, customData: { sketchizi: { workbenchEntityId: "api-1" } } }],
      appState: { scrollX: -4, scrollY: -8, zoom: { value: 1.2 } }, files: {},
    },
  },
});
const simulationProfile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 2000, seed: 913 }));
const experimentSuite = runWorkbenchExperiments({ workbench, simulationProfile });
if (experimentSuite.status !== "completed") throw new Error(`Smoke fixture simulation did not complete: ${experimentSuite.status}`);
const historyEntry = createSimulationHistoryEntry(experimentSuite, { workbench, simulationProfile, createdAt: "2026-10-17T12:00:00.000Z", id: "browser-smoke-history-1" });
workbench.simulationProfile = simulationProfile;
workbench.simulationHistory = appendSimulationHistory([], historyEntry);
const extensions = withWorkbenchExtension({ "com.example.opaque": { preserveMe: true, schema: 3 } }, workbench);
const scene = {
  elements: [
    { id: "ui-placement", type: "rectangle", x: 20, y: 20, width: 130, height: 70, customData: { sketchizi: { workbenchEntityId: "ui-1" } } },
    { id: "image-placement", type: "image", fileId: "image-1", x: 180, y: 30, width: 20, height: 20 },
  ],
  appState: { viewBackgroundColor: "#ffffff", scrollX: 2, scrollY: -3, zoom: { value: 1.1 } },
  files: { "image-1": { id: "image-1", dataURL: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/png" } },
};

async function writePhase() {
  await saveSketch({ ...scene, metadata: { title: "Workbench Browser Round Trip" }, extensions, format: "sketchizi" });
  await saveRecentSketch({ id: "browser-smoke-recent", name: "Workbench Browser Round Trip.sketchizi", ...scene, metadata: { title: "Recent Snapshot" }, extensions, format: "sketchizi" });
  saveEmergencyBackup({ ...scene, metadata: { title: "Emergency Backup" }, extensions, format: "sketchizi" });
  const encoded = serializeDrawing({ ...scene, metadata: { title: "Workbench Browser Round Trip" }, extensions, format: "sketchizi" });
  sessionStorage.setItem("workbench-browser-smoke-file", encoded);
  sessionStorage.setItem("workbench-browser-smoke-phase", "read");
  location.reload();
}

async function readPhase() {
  const active = await loadSketch();
  expect(active?.format === "sketchizi", "IndexedDB active sketch survives page reload with Sketchizi format");
  expect(active?.metadata?.title === "Workbench Browser Round Trip", "active document metadata survives reload");
  expect(active?.extensions?.[WORKBENCH_EXTENSION_KEY]?.modelRevision === 9, "semantic model survives reload");
  expect(active?.extensions?.[WORKBENCH_EXTENSION_KEY]?.simulationHistory?.length === 1, "simulation history survives IndexedDB save and page reload");
  const savedHistory = active?.extensions?.[WORKBENCH_EXTENSION_KEY]?.simulationHistory?.[0];
  expect(savedHistory?.runs?.baseline?.result?.metrics?.offeredRequests > 0, "saved history retains baseline metrics without rerunning the engine");
  const restoredHistory = restoreSimulationHistoryEntry(savedHistory);
  expect(restoredHistory?.historyEntryId === "browser-smoke-history-1", "saved history can be restored into the results model");
  expect(simulationResultsAreStale(restoredHistory, active.extensions[WORKBENCH_EXTENSION_KEY], active.extensions[WORKBENCH_EXTENSION_KEY].simulationProfile) === false, "history is current when model and profile match");
  const renamedModel = structuredClone(active.extensions[WORKBENCH_EXTENSION_KEY]);
  renamedModel.entities.find((entity) => entity.id === "api-1").name = "Renamed API";
  expect(simulationResultsAreStale(restoredHistory, renamedModel, renamedModel.simulationProfile) === true, "history is marked stale after a semantic model change");
  const changedProfile = structuredClone(active.extensions[WORKBENCH_EXTENSION_KEY].simulationProfile);
  changedProfile.profilesByEntityId["api-1"].parameters.meanServiceMs += 5;
  expect(simulationResultsAreStale(restoredHistory, active.extensions[WORKBENCH_EXTENSION_KEY], changedProfile) === true, "history is marked stale after a simulation profile change");
  expect(active?.extensions?.[WORKBENCH_EXTENSION_KEY]?.viewScenes?.apis?.elements?.[0]?.id === "api-placement", "inactive view layout survives reload");
  expect(active?.extensions?.["com.example.opaque"]?.preserveMe === true, "unknown extension data survives reload");
  expect(active?.files?.["image-1"]?.dataURL?.startsWith("data:image/png;base64,"), "image file payload survives IndexedDB round trip");

  const recent = await loadRecentSketch("browser-smoke-recent");
  expect(recent?.metadata?.title === "Recent Snapshot", "recent-file snapshot survives reload");
  expect(recent?.extensions?.[WORKBENCH_EXTENSION_KEY]?.viewScenes?.apis?.elements?.[0]?.id === "api-placement", "recent snapshot retains inactive view layout");

  const emergency = JSON.parse(localStorage.getItem("sketchizi-emergency-backup") || "null");
  expect(emergency?.extensions?.[WORKBENCH_EXTENSION_KEY]?.activeViewId === "system", "emergency backup retains active view and Workbench extension");

  const serialized = sessionStorage.getItem("workbench-browser-smoke-file");
  const parsed = parseDrawing(serialized);
  expect(parsed.format === "sketchizi", "serialized file identifies as .sketchizi document");
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.entities?.length === 3, "serialized file retains shared entities");
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.simulationHistory?.[0]?.id === "browser-smoke-history-1", "file serialization retains simulation history");
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.viewScenes?.apis?.elements?.[0]?.id === "api-placement", "serialized file retains the second view scene");
  expect(parsed.files?.["image-1"]?.mimeType === "image/png", "serialized file retains referenced image payload");

  status.textContent = "PASS — browser reload and simulation-history test";
  status.style.color = "#16733d";
  details.textContent = results.join("\n");
  document.body.dataset.result = "passed";
  sessionStorage.removeItem("workbench-browser-smoke-phase");
  await reportResult({ status: "passed", results });
}

async function reportResult(result) {
  const response = await fetch("/__result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...result, completedAt: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Local test runner rejected result (${response.status})`);
}

try {
  if (sessionStorage.getItem("workbench-browser-smoke-phase") === "read") {
    await readPhase();
  } else {
    await writePhase();
  }
} catch (error) {
  status.textContent = "FAIL — browser reload and simulation-history test";
  status.style.color = "#b42318";
  details.textContent = `${results.join("\n")}\nFAIL ${error?.stack || error}`;
  document.body.dataset.result = "failed";
  console.error(error);
  try {
    await reportResult({ status: "failed", results: [...results, `FAIL ${error?.stack || error}`] });
  } catch (reportError) {
    details.textContent += `\nUnable to report result to local runner: ${reportError?.message || reportError}`;
  }
}
