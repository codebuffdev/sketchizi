import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCloudDiagramResponse } from "../src/features/workspace/cloudDiagramPayload.js";

const document = { elements: [{ id: "shape-1", type: "rectangle" }], appState: {}, files: {} };

test("issue 3: a record that stores its document in `data` keeps its name and id", () => {
  const result = normalizeCloudDiagramResponse({ id: "d1", name: "Network map", revision: 4, data: document }, "d1");
  assert.equal(result.name, "Network map");
  assert.equal(result.diagram.id, "d1");
  assert.equal(result.diagram.revision, 4);
  assert.deepEqual(result.document, document);
});

test("issue 3: an envelope holding a diagram record whose document is in `data` is unwrapped once", () => {
  const result = normalizeCloudDiagramResponse({ success: true, data: { id: "d2", name: "Cloud design", data: document } }, "d2");
  assert.equal(result.name, "Cloud design");
  assert.deepEqual(result.document, document);
});

test("issue 3: an envelope that carries the document directly still loads, using the fallback name", () => {
  const result = normalizeCloudDiagramResponse({ data: document }, "d3", { fallbackName: "Saved architecture" });
  assert.equal(result.name, "Saved architecture");
  assert.deepEqual(result.document, document);
});

test("issue 3: existing envelope shapes are unchanged", () => {
  const a = normalizeCloudDiagramResponse({ data: { diagram: { id: "d4", title: "T", content: JSON.stringify(document) } } }, "d4");
  assert.equal(a.name, "T");
  const b = normalizeCloudDiagramResponse({ ok: true, data: { id: "d5", name: "N", document } }, "d5");
  assert.equal(b.name, "N");
  assert.deepEqual(b.document, document);
});

test("issue 3: malformed payloads still raise the actionable error", () => {
  assert.throws(() => normalizeCloudDiagramResponse({ id: "d6", name: "Broken", data: {} }, "d6"), /valid Sketchizi document/);
});
