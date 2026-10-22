import test from "node:test";
import assert from "node:assert/strict";
import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS, WORKBENCH_VIEWS } from "../src/features/workbench/workbenchRegistry.js";
import { createWorkbenchExtension, activateWorkbenchView } from "../src/features/workbench/workbenchDocument.js";

test("Workbench component and view registry IDs are unique, stable, and displayable", () => {
  const kinds = WORKBENCH_COMPONENTS.map((component) => component.kind);
  const viewIds = WORKBENCH_VIEWS.map((view) => view.id);
  assert.equal(new Set(kinds).size, kinds.length, "component kind IDs must be unique");
  assert.equal(new Set(viewIds).size, viewIds.length, "view IDs must be unique");
  assert.ok(kinds.every((kind) => /^[a-z]+(?:[.-][a-z0-9]+)+$/.test(kind)));
  assert.ok(WORKBENCH_COMPONENTS.every((item) => item.label && item.group && item.details && item.fill && item.stroke));
  assert.deepEqual(viewIds, ["system", "apis", "data", "deployment", "lld"]);
  assert.ok(WORKBENCH_COMPONENTS.filter((item) => item.designLevel === "lld").length >= 6, "LLD must include implementation-level building blocks");
  assert.ok(WORKBENCH_COMPONENTS.some((item) => item.kind === "backend.java-class"));
  assert.ok(WORKBENCH_COMPONENTS.some((item) => item.kind === "backend.repository"));
});

test("an inactive view starts independently empty and can be activated without semantic duplication", () => {
  const views = WORKBENCH_VIEWS.map(({ id, label, description }) => ({ id, label, description }));
  const emptyScene = { elements: [], appState: {}, files: {} };
  const workbench = createWorkbenchExtension({
    activeViewId: "system",
    views,
    entities: [{ id: "entity-api", kind: "backend.rest-service", name: "API", properties: {} }],
    relations: [],
    viewScenes: { apis: emptyScene, data: emptyScene, deployment: emptyScene, lld: emptyScene },
  });
  const result = activateWorkbenchView({
    workbench,
    currentScene: { elements: [{ id: "e1", type: "rectangle" }], appState: {}, files: {} },
    targetViewId: "apis",
  });
  assert.equal(result.workbench.activeViewId, "apis");
  assert.equal(result.scene.elements.length, 0);
  assert.equal(result.workbench.viewScenes.system.elements.length, 1);
  assert.equal(result.workbench.entities.length, 1);
});


test("LLD registry defines implementation-level elements and typed code relationships", () => {
  const kinds = new Set(WORKBENCH_COMPONENTS.map((component) => component.kind));
  const relationSource = WORKBENCH_RELATIONS.map((relation) => relation.kind);
  assert.ok(["backend.java-class", "backend.java-interface", "backend.rest-controller", "backend.repository", "design.domain-entity"].every((kind) => kinds.has(kind)));
  assert.ok(["implements", "extends", "uses", "maps-to", "handles"].every((kind) => relationSource.includes(kind)));
});
