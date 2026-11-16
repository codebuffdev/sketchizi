import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SKETCHIZI_DOCUMENT_TITLE, getCanvasBrowserTitle } from "../src/features/files/documentTitle.js";

test("uses the default product title when the canvas is unnamed", () => {
  assert.equal(getCanvasBrowserTitle(""), DEFAULT_SKETCHIZI_DOCUMENT_TITLE);
  assert.equal(getCanvasBrowserTitle(null), DEFAULT_SKETCHIZI_DOCUMENT_TITLE);
  assert.equal(getCanvasBrowserTitle("Untitled drawing"), DEFAULT_SKETCHIZI_DOCUMENT_TITLE);
});

test("uses the canvas name in the browser tab title", () => {
  assert.equal(getCanvasBrowserTitle("AWS Architecture"), "Sketchizi - AWS Architecture");
});

test("trims whitespace from canvas names", () => {
  assert.equal(getCanvasBrowserTitle("  Kubernetes Cluster  "), "Kubernetes Cluster - Sketchizi");
});
