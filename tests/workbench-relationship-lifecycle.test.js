import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/features/workbench/workbenchModel.js", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/persistence.js", import.meta.url), "utf8");
const scene = readFileSync(new URL("../src/features/workbench/typedRelationScene.js", import.meta.url), "utf8");

function callbackBody(name, nextName) {
  const start = controller.indexOf(`const ${name} = useCallback`);
  assert.notEqual(start, -1, `${name} callback should exist`);
  const end = nextName ? controller.indexOf(`const ${nextName} = useCallback`, start + 1) : controller.indexOf("const createRelation = useCallback", start + 1);
  assert.notEqual(end, -1, `end of ${name} callback should exist`);
  return controller.slice(start, end);
}

test("create, update, and delete each persist the semantic model and matching scene snapshot", () => {
  for (const [name, next] of [["createRelationBetween", "updateRelation"], ["updateRelation", "deleteRelation"], ["deleteRelation", "createRelation"]]) {
    const body = callbackBody(name, next);
    assert.match(body, /saveDocument\(next,\s*\{\s*\.\.\.scene,\s*elements\s*\}\)/, `${name} must persist the model and resulting scene together`);
    assert.match(body, /api\.updateScene\(\{ elements,/, `${name} must update the live canvas scene`);
    assert.match(body, /modelRevision:\s*workbench\.modelRevision\s*\+\s*1/, `${name} must increment model revision`);
  }
});

test("relationship edits preserve the canonical relation ID and update its fields in place", () => {
  const body = callbackBody("updateRelation", "deleteRelation");
  assert.match(body, /relation\.id === relationId\s*\?\s*\{\s*\.\.\.relation,\s*kind,\s*sourceId,\s*targetId\s*\}/);
  assert.match(body, /validateRelationAgainstModel\(kind, sourceEntity, targetEntity, workbench\.entities, remainingRelations\)/);
});

test("deletion tombstones only the connector owned by the semantic relation", () => {
  const body = callbackBody("deleteRelation", "createRelation");
  assert.match(body, /customData\?\.workbench\?\.relationId !== relationId/);
  assert.match(body, /customData\?\.workbench\?\.role !== "relation"/);
  assert.match(body, /isDeleted:\s*true/);
});

test("document model and persistence retain typed relationship records for reload", () => {
  assert.match(model, /relations/);
  assert.match(persistence, /extensions/);
  assert.match(persistence, /buildSketchPersistenceRecord/);
});

test("typed connector metadata carries relation ID, view, role, and kind for round-trip matching", () => {
  assert.match(scene, /relationId/);
  assert.match(scene, /viewId/);
  assert.match(scene, /role:\s*"relation"/);
  assert.match(scene, /kind/);
});
