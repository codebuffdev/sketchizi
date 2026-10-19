import test from "node:test";
import assert from "node:assert/strict";
import { createIndexHypothesisBrowserSmokeFixture } from "./browser/workbench-index-smoke-fixture.js";
import { appendSimulationHistory, assessSimulationReproducibility, compareSimulationHistoryEntries, createSimulationHistoryEntry, restoreSimulationHistoryEntry, simulationResultsAreStale } from "../src/features/simulation/experiments/simulationHistory.js";
import { runWorkbenchExperiments } from "../src/features/simulation/runWorkbenchExperiments.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";
import { withWorkbenchExtension, WORKBENCH_EXTENSION_KEY } from "../src/features/workbench/workbenchDocument.js";

function buildWorkflow() {
  const { workbench, simulationProfile, experimentSuite } = createIndexHypothesisBrowserSmokeFixture();
  const original = createSimulationHistoryEntry(experimentSuite, {
    workbench, simulationProfile, createdAt: "2026-10-19T10:00:00.000Z", id: "workflow-original",
  });
  const replaySuite = runWorkbenchExperiments({ workbench, simulationProfile });
  assert.equal(replaySuite.status, "completed");
  const replay = createSimulationHistoryEntry(replaySuite, {
    workbench, simulationProfile, createdAt: "2026-10-19T10:01:00.000Z", id: "workflow-replay",
  });
  const history = appendSimulationHistory(appendSimulationHistory([], replay), original);
  return { workbench, simulationProfile, original, replay, history };
}

test("end-to-end experiment workflow preserves separate evidence through Sketchizi serialization", () => {
  const { workbench, simulationProfile, original, replay, history } = buildWorkflow();
  const extension = { ...workbench, simulationProfile, simulationHistory: history };
  const encoded = serializeDrawing({ elements: [], appState: {}, files: {}, extensions: withWorkbenchExtension({}, extension), format: "sketchizi" });
  const decoded = parseDrawing(encoded);
  const persisted = decoded.extensions[WORKBENCH_EXTENSION_KEY].simulationHistory;
  assert.deepEqual(persisted.map((entry) => entry.id).sort(), ["workflow-original", "workflow-replay"]);
  assert.equal(persisted.find((entry) => entry.id === original.id).runs.baseline.result.metrics.offeredRequests, original.runs.baseline.result.metrics.offeredRequests);
  assert.notEqual(original.id, replay.id, "rerun must not overwrite original evidence");
});

test("unchanged inputs reproduce metrics and compare with zero deltas after history restoration", () => {
  const { workbench, simulationProfile, original, replay } = buildWorkflow();
  const verdict = assessSimulationReproducibility(original, replay);
  assert.equal(verdict.status, "exact-match", JSON.stringify(verdict.warnings));
  const comparison = compareSimulationHistoryEntries(original, replay);
  assert.ok(comparison.rows.length > 0);
  assert.ok(comparison.rows.every((row) => row.matched));
  assert.ok(comparison.rows.every((row) => row.metrics.every((metric) => metric.delta === 0 || metric.delta === null)), "available metrics have zero deltas and unavailable metrics stay null");
  assert.ok(comparison.rows.some((row) => row.metrics.some((metric) => metric.delta === 0)));
  const restored = restoreSimulationHistoryEntry(original);
  assert.equal(simulationResultsAreStale(restored, workbench, simulationProfile), false);
});

test("semantic model or profile changes mark the saved result stale without mutating evidence", () => {
  const { workbench, simulationProfile, original } = buildWorkflow();
  const restored = restoreSimulationHistoryEntry(original);
  const changedModel = structuredClone(workbench);
  changedModel.entities.find((entity) => entity.id === "api-1").name = "Renamed API";
  assert.equal(simulationResultsAreStale(restored, changedModel, simulationProfile), true);
  const changedProfile = structuredClone(simulationProfile);
  changedProfile.profilesByEntityId["api-1"].parameters.meanServiceMs += 5;
  assert.equal(simulationResultsAreStale(restored, workbench, changedProfile), true);
  assert.equal(original.runs.baseline.result.metrics.offeredRequests, restored.runs.baseline.result.result.metrics.offeredRequests);
});

test("browser smoke covers rerun, comparison, stale detection, and persisted original evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./browser/workbench-persistence-smoke.js", import.meta.url), "utf8");
  assert.match(source, /runWorkbenchExperiments\(\{ workbench, simulationProfile \}\)/);
  assert.match(source, /assessSimulationReproducibility\(savedHistory, replayHistory\)/);
  assert.match(source, /compareSimulationHistoryEntries\(savedHistory, replayHistory\)/);
  assert.match(source, /simulationResultsAreStale\(restoredHistory, renamedModel/);
  assert.match(source, /original and replay experiment evidence/);
});
