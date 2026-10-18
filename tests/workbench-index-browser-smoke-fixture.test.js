import test from "node:test";
import assert from "node:assert/strict";
import { createIndexHypothesisBrowserSmokeFixture } from "./browser/workbench-index-smoke-fixture.js";

test("browser release fixture runs the index hypothesis from real simulation evidence without mutating the source model", () => {
  const fixture = createIndexHypothesisBrowserSmokeFixture();
  assert.equal(fixture.experimentSuite.status, "completed");
  assert.equal(fixture.workbench.entities.length, 5);
  assert.equal(fixture.experimentSuite.projection.topology.nodes.length, 3);
  assert.equal(fixture.indexEvidence.candidateColumn, "name");
  assert.equal(fixture.indexEvidence.beforeFraction, 0);
  assert.equal(fixture.indexEvidence.afterFraction, 0.25);
  assert.ok(fixture.indexEvidence.candidateSql.includes("CREATE INDEX IF NOT EXISTS"));
  assert.ok(fixture.indexEvidence.indexedReadOperationsStarted > 0);
  assert.ok(fixture.indexEvidence.indexAssumedTimeSavedMsTotal > 0);
  assert.ok(fixture.indexEvidence.acceptedSchemaSql.includes('CREATE INDEX IF NOT EXISTS "idx_items_created_at"'));
  assert.equal(fixture.indexEvidence.openApiPath, "/api/items");
});
