import test from "node:test";
import assert from "node:assert/strict";
import { updateWorkbenchEntity } from "../src/features/workbench/workbenchModel.js";

const entity = (id, kind, properties = {}) => ({ id, kind, name: id, properties });

test("HLD-to-LLD ownership persists in the entity properties model", () => {
  const entities = [entity("service", "backend.rest-service"), entity("controller", "backend.rest-controller")];
  const updated = updateWorkbenchEntity(entities, "controller", { properties: { implementationParentId: "service" } });
  assert.equal(updated.find((item) => item.id === "controller").properties.implementationParentId, "service");
  assert.equal(updated.find((item) => item.id === "service").properties.implementationParentId, undefined);
});

test("changing HLD parent preserves other component properties", () => {
  const entities = [entity("service-a", "backend.rest-service"), entity("service-b", "backend.worker"), entity("controller", "backend.rest-controller", { implementationParentId: "service-a", packageName: "com.example.api" })];
  const updated = updateWorkbenchEntity(entities, "controller", { properties: { implementationParentId: "service-b" } });
  const controller = updated.find((item) => item.id === "controller");
  assert.equal(controller.properties.implementationParentId, "service-b");
  assert.equal(controller.properties.packageName, "com.example.api");
});

test("clearing HLD ownership unassigns an LLD component without deleting it", () => {
  const entities = [entity("service", "backend.rest-service"), entity("controller", "backend.rest-controller", { implementationParentId: "service" })];
  const updated = updateWorkbenchEntity(entities, "controller", { properties: { implementationParentId: "" } });
  assert.equal(updated.find((item) => item.id === "controller").properties.implementationParentId, "");
  assert.equal(updated.length, 2);
});
