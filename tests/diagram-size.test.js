import test from "node:test";
import assert from "node:assert/strict";
import { computeDocumentBytes, getDiagramBytes, getSizeState, slugifyTitle, downloadFilename, buildDownloadPayload, sumBytes, formatBytes } from "../src/features/workspace/diagramSize.js";

test("computes UTF-8 bytes of elements + files", () => {
  const doc = { elements: [{ id: "é" }], files: { a: { dataURL: "xx" } }, appState: { big: "ignored" } };
  assert.equal(computeDocumentBytes(doc), Buffer.byteLength(JSON.stringify({ elements: doc.elements, files: doc.files })));
  assert.equal(computeDocumentBytes(null), null);
});
test("formats and classifies size", () => {
  assert.equal(formatBytes(248 * 1024), "248 KB");
  assert.equal(formatBytes(1.4 * 1024 * 1024), "1.4 MB");
  assert.equal(getSizeState(100), "ok");
  assert.equal(getSizeState(1.7 * 1024 * 1024), "near");
  assert.equal(getSizeState(3 * 1024 * 1024), "over");
  assert.equal(getSizeState(undefined), "unknown");
});
test("row size prefers measured document, falls back to server size", () => {
  assert.equal(getDiagramBytes({ sizeBytes: 500 }), 500);
  assert.ok(getDiagramBytes({ document: { elements: [] } }) > 0);
  assert.equal(getDiagramBytes({}), null);
  assert.equal(sumBytes([1, null, 2]), 3);
  assert.equal(sumBytes([null]), null);
});
test("filename and payload", () => {
  assert.equal(slugifyTitle("Feat-Bugs Do/Donts!"), "Feat-Bugs-Do-Donts");
  assert.equal(downloadFilename("  "), "diagram.sketchizi.json");
  const p = buildDownloadPayload({ name: "x" }, { elements: [1], files: { f: 1 } });
  assert.deepEqual([p.elements, p.files, p.type], [[1], { f: 1 }, "excalidraw"]);
});
