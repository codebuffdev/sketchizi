import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareTabsForPersistence, sanitizeTabAppState } from "../src/features/workspace/tabSnapshot.js";

const persistence = readFileSync(new URL("../src/persistence.js", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/hooks/useWorkspaceTabs.js", import.meta.url), "utf8");

const todoItems = [{ id: "t1", text: "Ship it", completed: false, section: "todo" }];

test("issue 4: tab appState keeps only stable view settings", () => {
  const safe = sanitizeTabAppState({
    viewBackgroundColor: "#fff", scrollX: 10, scrollY: -5, zoom: { value: 1.5 }, gridModeEnabled: true,
    activeTool: { type: "freedraw" }, openMenu: "canvas", contextMenu: { items: [() => {}] },
    collaborators: new Map([["u", {}]]), selectedElementIds: { a: true }, currentItemStrokeWidth: 4,
  });
  assert.deepEqual(Object.keys(safe).sort(), ["gridModeEnabled", "scrollX", "scrollY", "viewBackgroundColor", "zoom"]);
  assert.deepEqual(safe.zoom, { value: 1.5 });
  assert.deepEqual(sanitizeTabAppState(undefined), {});
  assert.deepEqual(sanitizeTabAppState("bad"), {});
});

test("issue 4: a non-cloneable appState no longer poisons the manifest or the Todo items", () => {
  const poisoned = { id: "canvas-1", name: "Canvas 1", todoItems, snapshot: { elements: [{ id: "e" }], appState: { contextMenu: { onClick() {} }, scrollX: 3 } } };
  // Proves the old behaviour: structuredClone of the raw tabs throws.
  assert.throws(() => structuredClone([poisoned]));
  const prepared = prepareTabsForPersistence([poisoned, { id: "canvas-2", name: "Canvas 2", todoItems: [], snapshot: { elements: [], appState: {} } }]);
  assert.doesNotThrow(() => structuredClone(prepared));
  assert.deepEqual(prepared[0].todoItems, todoItems);
  assert.deepEqual(prepared[0].snapshot.appState, { scrollX: 3 });
  assert.deepEqual(prepared[0].snapshot.elements, [{ id: "e" }]);
});

test("issue 4: a tab whose snapshot cannot be cloned falls back, keeping Todo items", () => {
  const circular = { id: "e" }; circular.self = circular;
  const bad = { id: "canvas-3", name: "Bad", todoItems, snapshot: { elements: [() => {}], appState: {}, files: { f: { fn() {} } } } };
  const prepared = prepareTabsForPersistence([bad]);
  assert.doesNotThrow(() => structuredClone(prepared));
  assert.deepEqual(prepared[0].todoItems, todoItems);
  const unserialisable = { id: "canvas-4", name: "Cyc", todoItems, snapshot: { elements: [circular, () => {}], appState: {} } };
  const out = prepareTabsForPersistence([unserialisable]);
  assert.doesNotThrow(() => structuredClone(out));
  assert.deepEqual(out[0].todoItems, todoItems);
});

test("issue 4: saveCanvasTabs and tab capture/apply go through the sanitizer", () => {
  assert.match(persistence, /structuredClone\(prepareTabsForPersistence\(tabs\)\)/);
  assert.match(tabs, /appState: sanitizeTabAppState\(sceneAppState\)/);
  assert.match(tabs, /\.\.\.sanitizeTabAppState\(snapshot\.appState\), theme: globalThemeRef\.current/);
});
