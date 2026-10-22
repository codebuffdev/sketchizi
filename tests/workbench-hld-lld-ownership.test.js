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

import { scopeWorkbenchToService } from "../src/features/workbench/workbenchArtifacts.js";

test("service artifact scope includes explicitly owned components and exposed endpoints only", () => {
  const workbench = {
    modelRevision: 7,
    entities: [
      entity("service-a", "backend.rest-service"),
      entity("service-b", "backend.rest-service"),
      entity("controller-a", "backend.rest-controller", { implementationParentId: "service-a" }),
      entity("controller-b", "backend.rest-controller", { implementationParentId: "service-b" }),
      entity("endpoint-a", "backend.api-endpoint"),
      entity("endpoint-b", "backend.api-endpoint"),
    ],
    relations: [
      { id: "r1", kind: "exposes", sourceId: "service-a", targetId: "endpoint-a" },
      { id: "r2", kind: "exposes", sourceId: "service-b", targetId: "endpoint-b" },
      { id: "r3", kind: "calls", sourceId: "controller-a", targetId: "endpoint-a" },
    ],
  };
  const scoped = scopeWorkbenchToService(workbench, "service-a");
  assert.deepEqual(scoped.entities.map((item) => item.id).sort(), ["controller-a", "endpoint-a", "service-a"]);
  assert.deepEqual(scoped.relations.map((item) => item.id).sort(), ["r1", "r3"]);
  assert.equal(scoped.artifactScope.serviceName, "service-a");
  assert.equal(scoped.modelRevision, 7);
});

test("unknown artifact scope fails closed rather than returning the full model", () => {
  const scoped = scopeWorkbenchToService({ entities: [entity("service", "backend.rest-service")], relations: [] }, "missing");
  assert.equal(scoped.entities.length, 0);
  assert.equal(scoped.relations.length, 0);
});

test("LLD ownership rejects a missing or unsupported HLD parent", async () => {
  const { validateImplementationOwnership } = await import("../src/features/workbench/workbenchModel.js");
  const entities = [entity("service", "backend.rest-service"), entity("controller", "backend.rest-controller")];
  assert.equal(validateImplementationOwnership(entities, "backend.rest-controller", "missing").valid, false);
  assert.equal(validateImplementationOwnership(entities, "backend.rest-controller", "controller").valid, false);
});

test("LLD ownership rejects assigning HLD components as children", async () => {
  const { validateImplementationOwnership } = await import("../src/features/workbench/workbenchModel.js");
  const entities = [entity("service", "backend.rest-service"), entity("other-service", "backend.worker")];
  assert.equal(validateImplementationOwnership(entities, "backend.rest-service", "service").valid, false);
  assert.equal(validateImplementationOwnership(entities, "backend.rest-controller", "service").valid, true);
});

test("entity updates cannot persist a dangling implementation parent", () => {
  const entities = [entity("service", "backend.rest-service"), entity("controller", "backend.rest-controller")];
  assert.throws(() => updateWorkbenchEntity(entities, "controller", { properties: { implementationParentId: "deleted-service" } }), /implementation parent/i);
});
