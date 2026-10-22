import test from "node:test";
import assert from "node:assert/strict";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";
import { buildRecentSketchPersistenceRecord, buildSketchPersistenceRecord, withDocumentMetadata } from "../src/persistence.js";
import {
  WORKBENCH_EXTENSION_KEY,
  activateWorkbenchView,
  createWorkbenchExtension,
  readWorkbenchDocument,
  withWorkbenchExtension,
} from "../src/features/workbench/workbenchDocument.js";

const entityModel = [
  { id: "frontend-1", kind: "frontend.react-app", name: "Web UI", properties: { port: 5173 } },
  { id: "api-1", kind: "backend.rest-service", name: "API", properties: { port: 8080 } },
  { id: "db-1", kind: "data.postgresql-database", name: "PostgreSQL", properties: { database: "app" } },
];
const relationships = [
  { id: "rel-ui-api", kind: "calls", sourceId: "frontend-1", targetId: "api-1" },
  { id: "rel-api-db", kind: "reads-writes", sourceId: "api-1", targetId: "db-1" },
];
const views = [
  { id: "system", kind: "system", title: "System" },
  { id: "apis", kind: "apis", title: "APIs" },
  { id: "data", kind: "data", title: "Data" },
];
const activeScene = {
  elements: [
    { id: "draw-frontend", type: "rectangle", x: 20, y: 20, width: 150, height: 80, version: 1, versionNonce: 1, customData: { sketchizi: { workbenchEntityId: "frontend-1" } } },
    { id: "note-system", type: "text", x: 20, y: 120, width: 150, height: 25, text: "Freeform note", originalText: "Freeform note", fontSize: 16, fontFamily: 5, version: 1, versionNonce: 2 },
  ],
  appState: { viewBackgroundColor: "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
  files: {},
};
const apiScene = {
  elements: [{ id: "draw-api", type: "rectangle", x: 60, y: 30, width: 170, height: 70, version: 2, versionNonce: 3, customData: { sketchizi: { workbenchEntityId: "api-1" } } }],
  appState: { viewBackgroundColor: "#eeeeee", scrollX: -12, scrollY: -34, zoom: { value: 1.25 } },
  files: {},
};
const dataScene = {
  elements: [{ id: "draw-db", type: "ellipse", x: 90, y: 50, width: 140, height: 90, version: 1, versionNonce: 4, customData: { sketchizi: { workbenchEntityId: "db-1" } } }],
  appState: { viewBackgroundColor: "#ffffff", scrollX: 4, scrollY: 5, zoom: { value: 0.8 } },
  files: {},
};

test("one .sketchizi document round-trips semantic model, active scene, inactive layouts and unknown extensions", () => {
  const workbench = createWorkbenchExtension({
    activeViewId: "system",
    modelRevision: 7,
    entities: entityModel,
    relations: relationships,
    views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  const extensions = withWorkbenchExtension({ "com.example.audit": { preserved: ["yes", 42] } }, workbench);
  const content = serializeDrawing({
    ...activeScene,
    format: "sketchizi",
    metadata: { title: "Full Stack SaaS" },
    extensions,
  });
  const parsed = parseDrawing(content);
  const restored = readWorkbenchDocument(parsed);

  assert.equal(restored.workbench.activeViewId, "system");
  assert.equal(restored.workbench.modelRevision, 7);
  assert.deepEqual(restored.workbench.entities, entityModel);
  assert.deepEqual(restored.workbench.relations, relationships);
  assert.deepEqual(restored.workbench.viewScenes.apis, apiScene);
  assert.deepEqual(restored.workbench.viewScenes.data, dataScene);
  assert.deepEqual(restored.activeScene.elements, activeScene.elements);
  assert.equal(restored.activeScene.elements[1].text, "Freeform note");
  assert.deepEqual(parsed.extensions["com.example.audit"], { preserved: ["yes", 42] });
  assert.ok(parsed.extensions[WORKBENCH_EXTENSION_KEY]);
});

test("switching views moves one layout into the inactive slot without duplicating semantic entities", () => {
  const workbench = createWorkbenchExtension({
    activeViewId: "system", entities: entityModel, relations: relationships, views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  const switched = activateWorkbenchView({ workbench, currentScene: activeScene, targetViewId: "apis" });
  assert.equal(switched.workbench.activeViewId, "apis");
  assert.deepEqual(switched.scene, apiScene);
  assert.deepEqual(switched.workbench.viewScenes.system, activeScene);
  assert.deepEqual(switched.workbench.viewScenes.data, dataScene);
  assert.equal(Object.hasOwn(switched.workbench.viewScenes, "apis"), false);
  assert.equal(switched.workbench.entities.length, 3);
  assert.equal(new Set(switched.workbench.entities.map((item) => item.id)).size, 3);

  const back = activateWorkbenchView({ workbench: switched.workbench, currentScene: switched.scene, targetViewId: "system" });
  assert.deepEqual(back.scene, activeScene);
  assert.equal(back.workbench.activeViewId, "system");
});

test("invariants reject dangling relations and unknown targets instead of silently corrupting document", () => {
  assert.throws(() => createWorkbenchExtension({
    activeViewId: "system", views: [{ id: "system", title: "System" }], entities: [{ id: "a" }],
    relations: [{ id: "bad", sourceId: "a", targetId: "missing" }], viewScenes: {},
  }), /references a missing entity/);

  const workbench = createWorkbenchExtension({
    activeViewId: "system", entities: entityModel, relations: relationships, views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  assert.throws(() => activateWorkbenchView({ workbench, currentScene: activeScene, targetViewId: "deployment" }), /does not exist/);
});

test("plain Excalidraw/Sketchizi files without the Workbench extension stay plain", () => {
  const parsed = parseDrawing(serializeDrawing({ ...activeScene, format: "sketchizi" }));
  const restored = readWorkbenchDocument(parsed);
  assert.equal(restored.workbench, null);
  assert.deepEqual(restored.activeScene.elements, activeScene.elements);
});


test("local autosave records preserve Workbench extensions, metadata, format, and binary files", () => {
  const workbench = createWorkbenchExtension({
    activeViewId: "system", entities: entityModel, relations: relationships, views,
    viewScenes: { apis: apiScene, data: dataScene }, modelRevision: 9,
  });
  const extensions = withWorkbenchExtension({ "com.example.audit": { keep: true } }, workbench);
  const files = { "image-1": { id: "image-1", dataURL: "data:image/png;base64,AA==" } };
  const record = buildSketchPersistenceRecord({
    elements: activeScene.elements,
    appState: activeScene.appState,
    files,
    format: "sketchizi",
    metadata: { title: "SaaS Architecture" },
    extensions,
  });
  assert.equal(record.format, "sketchizi");
  assert.deepEqual(record.metadata, { title: "SaaS Architecture" });
  assert.deepEqual(record.extensions[WORKBENCH_EXTENSION_KEY], workbench);
  assert.deepEqual(record.extensions["com.example.audit"], { keep: true });
  assert.deepEqual(record.files, files);
  assert.notEqual(record.extensions, extensions, "stored extension payload must not alias mutable document state");
});

test("recent-file snapshots preserve Workbench extension and legacy records remain compatible", () => {
  const workbench = createWorkbenchExtension({
    activeViewId: "system", entities: entityModel, relations: relationships, views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  const snapshot = buildRecentSketchPersistenceRecord({
    id: "snapshot-1", name: "SaaS.sketchizi", elements: activeScene.elements,
    appState: activeScene.appState, files: {}, metadata: { title: "SaaS" },
    extensions: withWorkbenchExtension({}, workbench), format: "sketchizi",
  });
  assert.equal(snapshot.id, "snapshot-1");
  assert.equal(snapshot.name, "SaaS.sketchizi");
  assert.equal(snapshot.format, "sketchizi");
  assert.deepEqual(snapshot.extensions[WORKBENCH_EXTENSION_KEY], workbench);

  const legacy = buildSketchPersistenceRecord({ elements: [], appState: {}, files: {} });
  assert.deepEqual(legacy.metadata, {});
  assert.deepEqual(legacy.extensions, {});
  assert.equal(legacy.format, "excalidraw");
  assert.throws(() => buildRecentSketchPersistenceRecord({ name: "missing-id" }), /id is required/);
});


test("save and emergency-recovery payload enrichment keeps document metadata when callers only provide a scene", () => {
  const workbench = createWorkbenchExtension({
    activeViewId: "system", entities: entityModel, relations: relationships, views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  const documentMetadata = {
    format: "sketchizi",
    metadata: { title: "Recovery test" },
    extensions: withWorkbenchExtension({ "com.example.audit": { safe: true } }, workbench),
  };
  const payload = withDocumentMetadata({ elements: activeScene.elements, appState: {}, files: {} }, documentMetadata);
  assert.equal(payload.format, "sketchizi");
  assert.deepEqual(payload.metadata, documentMetadata.metadata);
  assert.deepEqual(payload.extensions, documentMetadata.extensions);

  const overrides = withDocumentMetadata({ elements: [], metadata: { title: "Explicit" }, extensions: {} }, documentMetadata);
  assert.deepEqual(overrides.metadata, { title: "Explicit" });
  assert.deepEqual(overrides.extensions, {});
});

test("typed relationships and their canvas connector references survive a save/reopen round trip", () => {
  const typedRelations = [
    { id: "rel-ui-api", kind: "calls", sourceId: "frontend-1", targetId: "api-1", viewIds: ["system"], properties: {} },
    { id: "rel-api-db", kind: "reads", sourceId: "api-1", targetId: "db-1", viewIds: ["system"], properties: {} },
  ];
  const workbench = createWorkbenchExtension({
    activeViewId: "system",
    modelRevision: 12,
    entities: entityModel,
    relations: typedRelations,
    views,
    viewScenes: { apis: apiScene, data: dataScene },
  });
  const relationScene = {
    elements: [
      ...[
        ["shape-frontend", "frontend-1"],
        ["shape-api", "api-1"],
        ["shape-db", "db-1"],
      ].map(([id, entityId]) => ({
        id, type: "rectangle", x: 10, y: 10, width: 120, height: 60,
        customData: { workbench: { entityId, viewId: "system", role: "container" } },
      })),
      {
        id: "arrow-ui-api", type: "arrow", x: 130, y: 30, width: 100, height: 0,
        customData: { workbench: { relationId: "rel-ui-api", viewId: "system", role: "relation", kind: "calls" } },
      },
      {
        id: "arrow-api-db", type: "arrow", x: 250, y: 30, width: 100, height: 0,
        customData: { workbench: { relationId: "rel-api-db", viewId: "system", role: "relation", kind: "reads" } },
      },
    ],
    appState: { viewBackgroundColor: "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
    files: {},
  };

  const serialized = serializeDrawing({
    ...relationScene,
    format: "sketchizi",
    metadata: { title: "Typed relationship persistence" },
    extensions: withWorkbenchExtension({}, workbench),
  });
  const parsed = parseDrawing(serialized);
  const restored = readWorkbenchDocument(parsed);
  const connectors = restored.activeScene.elements
    .filter((element) => element.customData?.workbench?.role === "relation")
    .map((element) => ({
      relationId: element.customData.workbench.relationId,
      viewId: element.customData.workbench.viewId,
      kind: element.customData.workbench.kind,
    }));

  assert.deepEqual(restored.workbench.relations, typedRelations);
  assert.deepEqual(connectors, [
    { relationId: "rel-ui-api", viewId: "system", kind: "calls" },
    { relationId: "rel-api-db", viewId: "system", kind: "reads" },
  ]);
  for (const relation of restored.workbench.relations) {
    assert.ok(connectors.some((connector) => connector.relationId === relation.id && connector.kind === relation.kind));
  }
});

test("policy approval history persists inside the Workbench extension across Sketchizi serialization", () => {
  const policyGovernance = {
    policyHistory: [{ id: "policy-entry-v1", policy: { id: "release-policy", version: 1, overdueDays: 2, agingDays: 14, severities: ["error"], rolloutBlockersOnly: true }, changedAt: "2026-10-20T08:00:00.000Z", changedBy: "owner", rationale: "Initial policy." }],
    approvalEvents: [{ id: "event-submit", policyEntryId: "policy-entry-v1", action: "submit", status: "pending_approval", actor: "owner", rationale: "Please review.", at: "2026-10-20T09:00:00.000Z" }],
  };
  const workbench = createWorkbenchExtension({ activeViewId: "system", entities: entityModel, relations: relationships, views, viewScenes: { apis: apiScene, data: dataScene }, policyGovernance });
  const parsed = parseDrawing(serializeDrawing({ ...activeScene, format: "sketchizi", extensions: withWorkbenchExtension({}, workbench) }));
  const restored = readWorkbenchDocument(parsed).workbench;
  assert.deepEqual(restored.policyGovernance, policyGovernance);
});
