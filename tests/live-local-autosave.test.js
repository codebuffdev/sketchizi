import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLiveSketchSnapshot } from "../src/features/persistence/resolveLiveSketchSnapshot.js";

const source = readFileSync(new URL("../src/features/persistence/useSketchPersistence.js", import.meta.url), "utf8");

test("local autosave prefers live scene over stale callback elements", () => {
  const prior = [{ id: "old", type: "rectangle" }];
  const current = [{ id: "new", type: "ellipse" }];
  const api = {
    getSceneElementsIncludingDeleted: () => current,
    getAppState: () => ({ gridModeEnabled: true }),
  };
  const result = resolveLiveSketchSnapshot(api, prior, { gridModeEnabled: false });
  assert.strictEqual(result.elements, current);
  assert.equal(result.appState.gridModeEnabled, true);
});

test("live save preserves legitimate empty canvas and deletion tombstones", () => {
  const earlier = [{ id: "old" }];
  const empty = resolveLiveSketchSnapshot({ getSceneElementsIncludingDeleted: () => [] }, earlier, {});
  assert.deepEqual(empty.elements, []);

  const tombstone = [{ id: "old", isDeleted: true }];
  const deleted = resolveLiveSketchSnapshot({ getSceneElementsIncludingDeleted: () => tombstone }, earlier, {});
  assert.strictEqual(deleted.elements, tombstone);
});

test("local autosave falls back to callback when Excalidraw API is not ready", () => {
  const elements = [{ id: "fallback" }];
  const state = { zoom: 1 };
  assert.deepEqual(resolveLiveSketchSnapshot(null, elements, state), { elements, appState: state });
  assert.deepEqual(resolveLiveSketchSnapshot({ getSceneElements: () => elements }, [], state).elements, elements);
});

test("debounced callback resolves the live scene immediately before persistence", () => {
  assert.match(source, /const live = resolveLiveSketchSnapshot\(api, elements, appState\)/);
  assert.match(source, /elements: live\.elements, appState: live\.appState, files/);
  assert.match(source, /const files = api\?\.getFiles\?\.\(\) \|\| \{\}/);
});
