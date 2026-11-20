import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allowsEmptyCloudSave,
  isCloudSceneRestoring,
} from "../src/features/workspace/cloudSavePolicy.js";
import { createCloudDocument } from "../src/features/workspace/cloudDocument.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

// Extract the body of one `useCallback`/function by its declaration line.
function sliceFrom(source, marker, length = 2600) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `marker not found: ${marker}`);
  return source.slice(index, index + length);
}

test("issue 1: onChange is dropped only for the tab being hydrated from the cloud", () => {
  // Cloud tab still restoring and active: ignore callbacks.
  assert.equal(isCloudSceneRestoring({ restoringTabId: "cloud-1", activeTabId: "cloud-1", sceneReady: false }), true);
  // User opened a local tab while the cloud tab is still restoring: keep processing.
  assert.equal(isCloudSceneRestoring({ restoringTabId: "cloud-1", activeTabId: "canvas-2", sceneReady: false }), false);
  // Restoration finished.
  assert.equal(isCloudSceneRestoring({ restoringTabId: "cloud-1", activeTabId: "cloud-1", sceneReady: true }), false);
  // No cloud load in progress at all (the URL still has cloudDiagramId but nothing is restoring).
  assert.equal(isCloudSceneRestoring({ restoringTabId: "", activeTabId: "canvas-2", sceneReady: false }), false);
});

test("issue 1: the master onChange handler no longer gates on the URL cloudDiagramId", () => {
  const handler = sliceFrom(app, "const handleThemeAwareExcalidrawChange = useCallback(", 2200);
  assert.doesNotMatch(handler, /if \(cloudDiagramId && !cloudSceneReadyRef\.current\) return;/);
  assert.match(handler, /isCloudSceneRestoring\(\{[^}]*restoringTabId: cloudRestoringTabIdRef\.current[^}]*activeTabId: activeCanvasIdRef\.current/);
  assert.doesNotMatch(handler.split("], [")[0] ?? handler, /\[cloudDiagramId,/);
});

test("issue 1: the restoring marker is set for each cloud-tab bootstrap path and cleared on ready/error", () => {
  const sets = app.match(/cloudRestoringTabIdRef\.current = (existingCloudTab\.id|nextCloudTab\.id|nextTabs\[1\]\.id);/g) || [];
  assert.equal(sets.length, 3);
  const clears = app.match(/cloudRestoringTabIdRef\.current = "";/g) || [];
  assert.ok(clears.length >= 2, "marker must be cleared when hydration completes or fails");
});

test("issue 2: tombstone-only scenes are a real edit, empty record lists are not", () => {
  assert.equal(allowsEmptyCloudSave([{ id: "a", isDeleted: true }]), true);
  assert.equal(allowsEmptyCloudSave([{ id: "a", isDeleted: true }, { id: "b", isDeleted: true }]), true);
  assert.equal(allowsEmptyCloudSave([]), false);
  assert.equal(allowsEmptyCloudSave(null), false);
});

test("issue 2: deleting every element of a cloud diagram produces a saveable empty document", () => {
  const api = { getSceneElements: () => [], getAppState: () => ({}), getFiles: () => ({}) };
  const tombstones = [{ id: "a", isDeleted: true }, { id: "b", isDeleted: true, fileId: "f" }];
  // Before the fix every caller omitted allowEmpty and this threw "canvas is empty".
  const doc = createCloudDocument({ api, elements: tombstones, allowEmpty: allowsEmptyCloudSave(tombstones) });
  assert.deepEqual(doc.elements, []);
  assert.deepEqual(doc.files, {});
  // Saving a brand new, empty drawing to the cloud must still be refused.
  assert.throws(() => createCloudDocument({ api, elements: [] }), /canvas is empty/i);
  assert.throws(() => createCloudDocument({ api }), /canvas is empty/i);
});

test("issue 2: cloud autosave and tab-switch save both pass the empty-save policy", () => {
  const queue = sliceFrom(app, "const queueSketchSave = useCallback(", 3200);
  assert.match(queue, /allowEmpty: allowsEmptyCloudSave\(elements\)/);
  const switcher = sliceFrom(app, "const switchCanvasTab = useCallback(", 4200);
  assert.match(switcher, /allowEmpty: allowsEmptyCloudSave\(currentSnapshot\.elements\)/);
  // A scene with no element records must not abort the tab switch.
  assert.match(switcher, /else if \(hasCloudSceneChange\(currentSnapshot\?\.elements\)\)/);
  // The literal guard in workspace-foundation.test.js stays valid.
  assert.doesNotMatch(app, /allowEmpty: true/);
});
