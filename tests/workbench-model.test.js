import test from "node:test";
import assert from "node:assert/strict";
import { WORKBENCH_RELATIONS } from "../src/features/workbench/workbenchRegistry.js";
import { createWorkbenchRelation, getComponentDefinition, updateWorkbenchEntity, validateRelationEndpoints } from "../src/features/workbench/workbenchModel.js";

const entity = (id, kind, name = id) => ({ id, kind, name, properties: {} });

test("typed relation registry uses stable, unique IDs and has endpoint rules", () => {
  const ids = WORKBENCH_RELATIONS.map((item) => item.kind);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(WORKBENCH_RELATIONS.every((item) => item.label && item.description && item.sourceKinds.length && item.targetKinds.length));
});

test("frontend calls REST service and creates a typed relation with stable endpoints", () => {
  const source = entity("ui", "frontend.react-app");
  const target = entity("api", "backend.rest-service");
  assert.deepEqual(validateRelationEndpoints("calls", source, target), { valid: true, reason: "" });
  assert.deepEqual(createWorkbenchRelation({ id: "rel-1", kind: "calls", sourceEntity: source, targetEntity: target, viewId: "system" }), {
    id: "rel-1", kind: "calls", sourceId: "ui", targetId: "api", viewIds: ["system"], properties: {},
  });
});

test("invalid endpoint kinds and self-relations are rejected with useful reasons", () => {
  assert.equal(validateRelationEndpoints("reads", entity("ui", "frontend.react-app"), entity("db", "data.postgresql-database")).valid, false);
  assert.match(validateRelationEndpoints("calls", entity("api", "backend.rest-service"), entity("api", "backend.rest-service")).reason, /itself/);
  assert.match(validateRelationEndpoints("unknown", entity("ui", "frontend.react-app"), entity("api", "backend.rest-service")).reason, /Unknown relation/);
  assert.throws(() => createWorkbenchRelation({ id: "r", kind: "reads", sourceEntity: entity("ui", "frontend.react-app"), targetEntity: entity("db", "data.postgresql-database"), viewId: "system" }), /cannot start/);
});

test("entity inspector update only changes editable name and properties", () => {
  const original = entity("api", "backend.rest-service", "API");
  original.properties.port = 8080;
  original.createdAt = "fixed";
  const updated = updateWorkbenchEntity([original], "api", { name: "Billing API", properties: { port: 9090, basePath: "/billing" }, id: "tampered" });
  assert.equal(updated[0].name, "Billing API");
  assert.deepEqual(updated[0].properties, { port: 9090, basePath: "/billing" });
  assert.equal(updated[0].id, "api");
  assert.equal(updated[0].createdAt, "fixed");
  assert.throws(() => updateWorkbenchEntity([original], "missing", { name: "x" }), /not found/);
});

test("component registry includes editable schemas for the starter component catalog", () => {
  assert.ok(getComponentDefinition("backend.rest-service").properties.some((field) => field.key === "port"));
  assert.ok(getComponentDefinition("backend.api-endpoint").properties.some((field) => field.key === "method"));
});
