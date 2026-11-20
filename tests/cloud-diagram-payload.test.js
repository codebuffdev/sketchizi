import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCloudDiagramResponse } from "../src/features/workspace/cloudDiagramPayload.js";

const document = { elements: [{ id: "shape-1", type: "rectangle" }], appState: {}, files: {} };

test("normalizes the standard cloud diagram response", () => {
  const result = normalizeCloudDiagramResponse({ diagram: { id: "d1", name: "Network map", document } }, "d1");
  assert.equal(result.name, "Network map");
  assert.deepEqual(result.document, document);
});

test("normalizes nested envelopes and JSON-encoded document payloads", () => {
  const result = normalizeCloudDiagramResponse({ data: { diagram: { id: "d2", title: "Cloud design", content: JSON.stringify(document) } } }, "d2");
  assert.equal(result.name, "Cloud design");
  assert.deepEqual(result.document, document);
});

test("uses the persisted tab name when the API omits a display name", () => {
  const result = normalizeCloudDiagramResponse({ diagram: { id: "d3", document } }, "d3", { fallbackName: "Saved architecture" });
  assert.equal(result.name, "Saved architecture");
});

test("rejects malformed cloud documents with an actionable error", () => {
  assert.throws(() => normalizeCloudDiagramResponse({ diagram: { id: "d4", name: "Broken", document: "{}" } }, "d4"), /valid Sketchizi document/);
});
