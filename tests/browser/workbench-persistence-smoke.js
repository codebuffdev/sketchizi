import { loadRecentSketch, loadSketch, saveEmergencyBackup, saveRecentSketch, saveSketch } from "../../src/persistence.js";
import { parseDrawing, serializeDrawing } from "../../src/fileSystem.js";
import { withWorkbenchExtension, WORKBENCH_EXTENSION_KEY } from "../../src/features/workbench/workbenchDocument.js";
import { generateOpenApiArtifact, generateSqlArtifact } from "../../src/features/workbench/workbenchArtifacts.js";
import { appendSimulationHistory, createSimulationHistoryEntry, restoreSimulationHistoryEntry, simulationResultsAreStale } from "../../src/features/simulation/experiments/simulationHistory.js";
import { createIndexHypothesisBrowserSmokeFixture } from "./workbench-index-smoke-fixture.js";

const status = document.querySelector("#status");
const details = document.querySelector("#details");
const results = [];
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`);
};
const { workbench, simulationProfile, experimentSuite, indexEvidence } = createIndexHypothesisBrowserSmokeFixture();
sessionStorage.setItem("workbench-browser-smoke-index", JSON.stringify(indexEvidence));
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
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.entities?.length === 5, "serialized file retains shared runtime, endpoint, and table entities");
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.simulationHistory?.[0]?.id === "browser-smoke-history-1", "file serialization retains simulation history");
  expect(parsed.extensions?.[WORKBENCH_EXTENSION_KEY]?.viewScenes?.apis?.elements?.[0]?.id === "api-placement", "serialized file retains the second view scene");
  expect(parsed.files?.["image-1"]?.mimeType === "image/png", "serialized file retains referenced image payload");

  const restoredWorkbench = active?.extensions?.[WORKBENCH_EXTENSION_KEY];
  const restoredTable = restoredWorkbench?.entities?.find((entity) => entity.id === "table-1");
  expect(restoredTable?.properties?.indexes === JSON.stringify([{ name: "idx_items_created_at", columns: ["created_at"], method: "btree", unique: false }]), "accepted PostgreSQL index metadata survives IndexedDB reload");
  const restoredSql = generateSqlArtifact(restoredWorkbench);
  expect(restoredSql.ok === true && restoredSql.text.includes('CREATE INDEX IF NOT EXISTS "idx_items_created_at"'), "regenerated SQL retains accepted CREATE INDEX after reload");
  const restoredOpenApi = generateOpenApiArtifact(restoredWorkbench);
  expect(restoredOpenApi.ok === true && Object.hasOwn(JSON.parse(restoredOpenApi.text).paths || {}, "/api/items"), "OpenAPI path survives reload and regenerates from the same model");
  const indexEvidence = JSON.parse(sessionStorage.getItem("workbench-browser-smoke-index") || "null");
  expect(indexEvidence?.candidateColumn === "name" && indexEvidence?.candidateSql?.includes("CREATE INDEX IF NOT EXISTS"), "index hypothesis retains an explicit candidate column and reviewable SQL");
  expect(indexEvidence?.beforeFraction === 0 && indexEvidence?.afterFraction === 0.25, "index hypothesis records before/after assumption values");
  expect(indexEvidence?.indexedReadOperationsStarted > 0 && indexEvidence?.indexAssumedTimeSavedMsTotal > 0, "index trial records event-derived indexed-read evidence");
  expect(indexEvidence?.acceptedSchemaSql?.includes('CREATE INDEX IF NOT EXISTS "idx_items_created_at"') && indexEvidence?.openApiPath === "/api/items", "starter artifacts are generated from the same persisted model");

  status.textContent = "PASS — browser reload, experiment history, and index artifact test";
  status.style.color = "#16733d";
  details.textContent = results.join("\n");
  document.body.dataset.result = "passed";
  sessionStorage.removeItem("workbench-browser-smoke-phase");
  sessionStorage.removeItem("workbench-browser-smoke-index");
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
  status.textContent = "FAIL — browser reload, experiment history, and index artifact test";
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
