import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWorkbenchArtifactScope } from "../src/features/workbench/workbenchArtifacts.js";

const entity = (id, kind, properties = {}) => ({ id, kind, name: id, properties });

test("scope review lists explicitly included and excluded components without mutating the model", () => {
  const model = {
    entities: [
      entity("service-a", "backend.rest-service"),
      entity("service-b", "backend.worker"),
      entity("controller-a", "backend.rest-controller", { implementationParentId: "service-a" }),
      entity("controller-unassigned", "backend.java-class"),
      entity("endpoint-a", "backend.api-endpoint"),
    ],
    relations: [{ id: "exposes-a", kind: "exposes", sourceId: "service-a", targetId: "endpoint-a" }],
  };
  const before = structuredClone(model);
  const review = analyzeWorkbenchArtifactScope(model, "service-a");
  assert.deepEqual(review.includedEntities.map((item) => item.id).sort(), ["controller-a", "endpoint-a", "service-a"]);
  assert.deepEqual(review.excludedEntities.map((item) => item.id).sort(), ["controller-unassigned", "service-b"]);
  assert.deepEqual(review.includedRelations.map((item) => item.id), ["exposes-a"]);
  assert.ok(review.warnings.some((item) => item.code === "scope.unassigned-implementation"));
  assert.deepEqual(model, before);
});

test("whole-model scope review preserves all components and emits no scope warnings", () => {
  const model = { entities: [entity("service", "backend.rest-service"), entity("table", "data.postgresql-table")], relations: [] };
  const review = analyzeWorkbenchArtifactScope(model);
  assert.equal(review.scoped, false);
  assert.equal(review.includedEntities.length, 2);
  assert.equal(review.excludedEntities.length, 0);
  assert.deepEqual(review.warnings, []);
});

test("invalid service scope fails closed and explains the missing scope", () => {
  const review = analyzeWorkbenchArtifactScope({ entities: [entity("service", "backend.rest-service")], relations: [] }, "deleted-service");
  assert.equal(review.includedEntities.length, 0);
  assert.equal(review.excludedEntities.length, 1);
  assert.equal(review.warnings[0].code, "scope.unknown-service");
});
