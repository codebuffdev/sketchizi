import test from "node:test";
import assert from "node:assert/strict";
import { computeDocumentBytes, getDiagramBytes, getSizeState, slugifyTitle, downloadFilename, sumBytes, buildDownloadPayload, formatBytes } from "../src/features/workspace/diagramSize.js";
import { measureCloudPayloadBytes, createCloudDocument } from "../src/features/workspace/cloudDocument.js";
import { sortWorkspaceDiagrams, WORKSPACE_GRID_SORTS } from "../src/features/workspace/workspacePresentation.js";

const MB = 1024 * 1024;
test("size is the Blob size of { elements, appState, files } and formats cleanly", () => {
  const doc = { elements: [{ id: "é" }], appState: { zoom: { value: 1 } }, files: { a: { dataURL: "x".repeat(1000) } } };
  const expected = new Blob([JSON.stringify({ elements: doc.elements, appState: doc.appState, files: doc.files })]).size;
  assert.equal(computeDocumentBytes(doc), expected);
  assert.equal(measureCloudPayloadBytes({ elements: doc.elements, appState: doc.appState, files: doc.files }), expected);
  assert.equal(formatBytes(248 * 1024), "248 KB");
  assert.equal(formatBytes(1.42 * MB), "1.42 MB");
  assert.equal(formatBytes(4 * MB), "4 MB");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(computeDocumentBytes(null), null);
});
test("createCloudDocument stores sizeBytes in metadata", () => {
  const api = { getFiles: () => ({}), getAppState: () => ({}) };
  const doc = createCloudDocument({ api, elements: [{ id: "a", type: "rectangle" }], appState: {}, metadata: { metadata: { title: "t" } } });
  assert.equal(doc.metadata.title, "t");
  assert.equal(doc.metadata.sizeBytes, measureCloudPayloadBytes({ elements: doc.elements, appState: doc.appState, files: doc.files }));
});
test("row size prefers stored metadata, then measurement, then cache", () => {
  assert.equal(getDiagramBytes({ id: "1", document: { elements: [], metadata: { sizeBytes: 99 } } }), 99);
  assert.equal(getDiagramBytes({ id: "1", sizeBytes: 5, document: { elements: [] } }), 5);
  assert.ok(getDiagramBytes({ id: "1", document: { elements: [] } }) > 0);
  assert.equal(getDiagramBytes({ id: "9" }, { 9: 123 }), 123);
  assert.equal(getDiagramBytes({ id: "9" }), null);
});
test("amber heavy state starts at 2 MB", () => {
  assert.equal(getSizeState(2 * MB - 1), "ok");
  assert.equal(getSizeState(2 * MB), "heavy");
  assert.equal(getSizeState(undefined), "unknown");
});
test("Largest Size sort", () => {
  assert.equal(WORKSPACE_GRID_SORTS.size, "Largest Size");
  const rows = [{ id: "a", orderIndex: 0 }, { id: "b", orderIndex: 1 }, { id: "c", orderIndex: 2 }];
  const sizes = { a: 10, b: 300, c: 20 };
  assert.deepEqual(sortWorkspaceDiagrams(rows, "size", (d) => sizes[d.id]).map((d) => d.id), ["b", "c", "a"]);
});
test("filename slug and payload", () => {
  assert.equal(downloadFilename("Feat-Bugs Do/Donts!"), "Feat-Bugs-Do-Donts.sketchizi.json");
  assert.equal(slugifyTitle("///"), "diagram");
  const p = buildDownloadPayload({ name: "n" }, { elements: [1], files: { f: 1 } });
  assert.deepEqual([p.elements, p.files, p.type], [[1], { f: 1 }, "excalidraw"]);
  assert.equal(sumBytes([1, null, 2]), 3);
  assert.equal(sumBytes([null]), null);
});
