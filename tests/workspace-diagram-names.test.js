import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateDiagramName, normalizeDiagramName, readDiagramRows } from "../src/features/workspace/diagramNames.js";

const diagrams = [
  { id: "one", name: "System Design" },
  { id: "two", name: "API Gateway" },
];

test("diagram names normalize surrounding and repeated whitespace without case sensitivity", () => {
  assert.equal(normalizeDiagramName("  SYSTEM   design  "), "system design");
  assert.equal(findDuplicateDiagramName(diagrams, " system design ")?.id, "one");
});

test("duplicate lookup can exclude the diagram being renamed", () => {
  assert.equal(findDuplicateDiagramName(diagrams, "SYSTEM DESIGN", "one"), null);
  assert.equal(findDuplicateDiagramName(diagrams, "api gateway", "one")?.id, "two");
  assert.equal(findDuplicateDiagramName(diagrams, "New diagram"), null);
});

test("diagram rows are read from supported API response envelopes", () => {
  assert.deepEqual(readDiagramRows({ data: { diagrams } }), diagrams);
  assert.deepEqual(readDiagramRows({ data: diagrams }), diagrams);
  assert.deepEqual(readDiagramRows({ items: diagrams }), diagrams);
  assert.throws(() => readDiagramRows({ unexpected: [] }), /unsupported diagrams list/);
});
