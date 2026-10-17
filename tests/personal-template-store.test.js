import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("personal templates save, list, export, and import", async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  try {
    const store = await import(`../src/features/design/templates/personalTemplateStore.js?test=${Date.now()}`);
    const original = store.savePersonalTemplate({ name: "My architecture", domain: "software-architecture", elements: [{ id: "a", type: "rectangle" }] });
    assert.equal(store.listPersonalTemplates().length, 1);
    assert.equal(store.listPersonalTemplates()[0].name, "My architecture");
    const exported = store.exportPersonalTemplate(original.id);
    const imported = store.importPersonalTemplate(exported);
    assert.equal(imported.name, "My architecture");
    assert.equal(store.listPersonalTemplates().length, 2);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("personal template import rejects unsupported formats", async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  try {
    const store = await import(`../src/features/design/templates/personalTemplateStore.js?invalid=${Date.now()}`);
    assert.throws(() => store.importPersonalTemplate('{"hello":"world"}'), /Unsupported or invalid/);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("cloning template elements creates fresh IDs and repairs internal bindings", async () => {
  const store = await import(`../src/features/design/templates/personalTemplateStore.js?clone=${Date.now()}`);
  const elements = [
    { id: "shape", type: "rectangle", boundElements: [{ id: "label", type: "text" }] },
    { id: "label", type: "text", containerId: "shape" },
    { id: "arrow", type: "arrow", startBinding: { elementId: "shape" }, endBinding: { elementId: "label" } },
  ];
  const cloned = store.cloneTemplateElements({ elements });
  assert.equal(new Set(cloned.map((element) => element.id)).size, 3);
  assert.notEqual(cloned[0].id, "shape");
  assert.equal(cloned[1].containerId, cloned[0].id);
  assert.equal(cloned[2].startBinding.elementId, cloned[0].id);
  assert.equal(cloned[2].endBinding.elementId, cloned[1].id);
});
