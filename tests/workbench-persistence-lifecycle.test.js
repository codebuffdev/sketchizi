import test from "node:test";
import assert from "node:assert/strict";
import {
  loadRecentSketch,
  loadSketch,
  saveRecentSketch,
  saveSketch,
} from "../src/persistence.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";
import { createWorkbenchExtension, withWorkbenchExtension, WORKBENCH_EXTENSION_KEY } from "../src/features/workbench/workbenchDocument.js";

// Minimal deterministic IndexedDB test double for the stores and operations used
// here. It exercises the real save/load functions without a browser dependency.
const database = new Map();
const storeNames = ["documents", "recent-documents", "file-handles", "directory-handles"];
class FakeRequest {
  onsuccess = null;
  onerror = null;
  onupgradeneeded = null;
  onblocked = null;
  result = undefined;
  error = null;
}
class FakeTransaction {
  oncomplete = null;
  onerror = null;
  onabort = null;
  constructor(name) { this.name = name; }
  objectStore(name) {
    if (!database.has(name)) database.set(name, new Map());
    const store = database.get(name);
    const run = (op, key, value) => {
      const request = new FakeRequest();
      queueMicrotask(() => {
        try {
          if (op === "get") request.result = store.get(key);
          if (op === "put") { store.set(key, structuredClone(value)); request.result = key; }
          if (op === "delete") { store.delete(key); request.result = undefined; }
          if (op === "getAll") request.result = [...store.values()].map((item) => structuredClone(item));
          if (op === "getAllKeys") request.result = [...store.keys()];
          request.onsuccess?.();
          queueMicrotask(() => this.oncomplete?.());
        } catch (error) {
          request.error = error;
          request.onerror?.();
          this.onerror?.();
        }
      });
      return request;
    };
    return {
      get: (key) => run("get", key),
      put: (value, key) => run("put", key, value),
      delete: (key) => run("delete", key),
      getAll: () => run("getAll"),
      getAllKeys: () => run("getAllKeys"),
    };
  }
}
class FakeDatabase {
  objectStoreNames = { contains: (name) => storeNames.includes(name) };
  createObjectStore(name) { if (!database.has(name)) database.set(name, new Map()); }
  transaction(name) { return new FakeTransaction(name); }
  close() {}
}
globalThis.indexedDB = {
  open(_name, version) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.result = new FakeDatabase();
      request.onupgradeneeded?.({ oldVersion: 0, newVersion: version });
      request.onsuccess?.();
    });
    return request;
  },
};

const workbench = createWorkbenchExtension({
  activeViewId: "system",
  modelRevision: 4,
  entities: [
    { id: "ui-1", kind: "frontend.react-app", name: "Web UI", properties: {} },
    { id: "api-1", kind: "backend.rest-service", name: "API", properties: { port: 8080 } },
  ],
  relations: [{ id: "rel-1", kind: "calls", sourceId: "ui-1", targetId: "api-1" }],
  views: [
    { id: "system", kind: "system", title: "System" },
    { id: "apis", kind: "apis", title: "APIs" },
  ],
  viewScenes: {
    apis: {
      elements: [{ id: "api-placement", type: "rectangle", x: 80, y: 40, width: 120, height: 60, customData: { sketchizi: { workbenchEntityId: "api-1" } } }],
      appState: { scrollX: -4, scrollY: -8, zoom: { value: 1.2 } }, files: {},
    },
  },
});
const extensionBag = withWorkbenchExtension({ "com.example.opaque": { preserveMe: true } }, workbench);
const scene = {
  elements: [{ id: "ui-placement", type: "rectangle", x: 20, y: 20, width: 130, height: 70, customData: { sketchizi: { workbenchEntityId: "ui-1" } } }],
  appState: { viewBackgroundColor: "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
  files: { "image-1": { id: "image-1", dataURL: "data:image/png;base64,AA==" } },
};

test("real autosave/load APIs preserve the full Workbench document payload across reload boundary", async () => {
  await saveSketch({ ...scene, metadata: { title: "Lifecycle SaaS" }, extensions: extensionBag, format: "sketchizi" });
  const restoredRecord = await loadSketch();
  assert.equal(restoredRecord.format, "sketchizi");
  assert.deepEqual(restoredRecord.metadata, { title: "Lifecycle SaaS" });
  assert.deepEqual(restoredRecord.extensions[WORKBENCH_EXTENSION_KEY], workbench);
  assert.deepEqual(restoredRecord.extensions["com.example.opaque"], { preserveMe: true });
  assert.deepEqual(restoredRecord.elements, scene.elements);
  assert.deepEqual(restoredRecord.files, scene.files);

  const drawing = parseDrawing(serializeDrawing({
    format: restoredRecord.format,
    metadata: restoredRecord.metadata,
    extensions: restoredRecord.extensions,
    elements: restoredRecord.elements,
    appState: restoredRecord.appState,
    files: restoredRecord.files,
  }));
  assert.equal(drawing.extensions[WORKBENCH_EXTENSION_KEY].activeViewId, "system");
  assert.equal(drawing.extensions[WORKBENCH_EXTENSION_KEY].viewScenes.apis.elements[0].id, "api-placement");
});

test("real recent-snapshot APIs preserve Workbench metadata and inactive scenes", async () => {
  await saveRecentSketch({ id: "workbench-snapshot", name: "Lifecycle SaaS.sketchizi", ...scene, metadata: { title: "Recent SaaS" }, extensions: extensionBag, format: "sketchizi" });
  const restored = await loadRecentSketch("workbench-snapshot");
  assert.equal(restored.name, "Lifecycle SaaS.sketchizi");
  assert.equal(restored.format, "sketchizi");
  assert.equal(restored.metadata.title, "Recent SaaS");
  assert.deepEqual(restored.extensions[WORKBENCH_EXTENSION_KEY].viewScenes.apis, workbench.viewScenes.apis);
});
