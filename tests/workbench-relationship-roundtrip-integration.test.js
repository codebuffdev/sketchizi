import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchRelation, validateRelationAgainstModel } from "../src/features/workbench/workbenchModel.js";
import { attachWorkbenchRelationToArrow, relationVisualStyle } from "../src/features/workbench/typedRelationScene.js";
import { serializeDrawing, parseDrawing } from "../src/fileSystem.js";
import { buildSketchPersistenceRecord } from "../src/persistence.js";
import { WORKBENCH_EXTENSION_KEY } from "../src/features/workbench/workbenchDocument.js";

const viewId = "hld-main";
const service = { id: "service-orders", kind: "backend.rest-service", name: "Order Service" };
const database = { id: "database-orders", kind: "data.postgresql-database", name: "Orders DB" };
const external = { id: "external-payments", kind: "integrations.external-api", name: "Payments API" };
const entities = [service, database, external];
const appState = { viewBackgroundColor: "#ffffff", zoom: { value: 1 }, scrollX: 0, scrollY: 0 };

function connector(id, relation) {
  return attachWorkbenchRelationToArrow({
    id, type: "arrow", x: 100, y: 100, width: 120, height: 0, points: [[0, 0], [120, 0]],
    startBinding: { elementId: relation.sourceId, focus: 0, gap: 4 },
    endBinding: { elementId: relation.targetId, focus: 0, gap: 4 },
    version: 1, versionNonce: 11, customData: { vendor: { preserve: true } },
  }, { relationId: relation.id, viewId, kind: relation.kind });
}

function saveAndReopen(workbench, elements) {
  const extensions = { [WORKBENCH_EXTENSION_KEY]: workbench, "com.example.keep": { marker: "preserved" } };
  const record = buildSketchPersistenceRecord({ elements, appState, extensions, format: "sketchizi", metadata: { title: "Order design" } });
  const text = serializeDrawing({ elements: record.elements, appState: record.appState, files: record.files, format: record.format, metadata: record.metadata, extensions: record.extensions });
  return parseDrawing(text);
}

test("relationship create, edit, delete, save, and reopen preserve model/connector identity", () => {
  // Create: validate against the complete canonical model, then create the record and connector.
  assert.deepEqual(validateRelationAgainstModel("reads", service, database, entities, []), { valid: true, reason: "" });
  let relation = createWorkbenchRelation({ id: "relation-orders-reads-db", kind: "reads", sourceEntity: service, targetEntity: database, viewId });
  let relations = [relation];
  let elements = [connector("connector-orders-reads-db", relation), {
    id: "ordinary-arrow", type: "arrow", x: 0, y: 200, width: 30, height: 0, points: [[0, 0], [30, 0]], version: 1,
    customData: { userDrawn: true },
  }];

  // Edit: retain the canonical relation ID while changing kind and target, and sync connector metadata/bindings.
  const remaining = relations.filter((item) => item.id !== relation.id);
  assert.deepEqual(validateRelationAgainstModel("calls", service, external, entities, remaining), { valid: true, reason: "" });
  relation = { ...relation, kind: "calls", targetId: external.id };
  relations = relations.map((item) => item.id === relation.id ? relation : item);
  elements = elements.map((element) => element.id === "connector-orders-reads-db"
    ? { ...connector(element.id, relation), ...relationVisualStyle(relation.kind), customData: { ...element.customData, workbench: { ...element.customData.workbench, relationId: relation.id, viewId, role: "relation", kind: relation.kind } } }
    : element);
  assert.equal(relations[0].id, "relation-orders-reads-db");
  assert.equal(elements[0].customData.workbench.kind, "calls");
  assert.equal(elements[0].startBinding.elementId, service.id);
  assert.equal(elements[0].endBinding.elementId, external.id);

  // Save/reopen: both semantic record and connector metadata survive the Sketchizi envelope.
  let reopened = saveAndReopen({ entities, relations, modelRevision: 2, viewScenes: { [viewId]: { elements } } }, elements);
  let restoredWorkbench = reopened.extensions[WORKBENCH_EXTENSION_KEY];
  assert.equal(restoredWorkbench.relations[0].id, "relation-orders-reads-db");
  assert.equal(restoredWorkbench.relations[0].kind, "calls");
  assert.equal(reopened.elements.find((element) => element.id === "connector-orders-reads-db").customData.workbench.relationId, restoredWorkbench.relations[0].id);
  assert.deepEqual(reopened.extensions["com.example.keep"], { marker: "preserved" });

  // Delete: remove only the connector carrying this relation ID; unrelated arrows stay live.
  relations = restoredWorkbench.relations.filter((item) => item.id !== relation.id);
  elements = reopened.elements.map((element) => element.customData?.workbench?.role === "relation"
    && element.customData?.workbench?.relationId === relation.id ? { ...element, isDeleted: true } : element);
  reopened = saveAndReopen({ ...restoredWorkbench, relations, modelRevision: 3 }, elements);
  restoredWorkbench = reopened.extensions[WORKBENCH_EXTENSION_KEY];
  assert.equal(restoredWorkbench.relations.length, 0);
  assert.equal(reopened.elements.some((element) => element.id === "connector-orders-reads-db"), false, "deleted semantic connector should not be serialized as live scene content");
  assert.equal(reopened.elements.some((element) => element.id === "ordinary-arrow"), true, "unrelated user arrow must survive deletion");
});

test("invalid or duplicate relationships are rejected before a lifecycle mutation", () => {
  const existing = createWorkbenchRelation({ id: "existing", kind: "reads", sourceEntity: service, targetEntity: database, viewId });
  assert.equal(validateRelationAgainstModel("reads", service, database, entities, [existing]).valid, false);
  assert.equal(validateRelationAgainstModel("reads", service, external, entities, []).valid, false, "reads cannot target an external API");
  assert.equal(validateRelationAgainstModel("calls", service, service, entities, []).valid, false, "self-relationships are invalid");
});
