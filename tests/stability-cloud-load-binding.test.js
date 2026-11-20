import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCloudLoadTarget } from "../src/features/workspace/cloudSavePolicy.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const start = app.indexOf("const targetTabId = cloudRestoringTabIdRef.current");
const effect = app.slice(start - 600, start + 7200);

test("issue 3: a finished cloud load is routed to the tab that started it", () => {
  const tabIds = ["canvas-1", "cloud-1-1700"];
  assert.equal(resolveCloudLoadTarget({ targetTabId: "cloud-1-1700", activeTabId: "cloud-1-1700", tabIds }), "apply");
  assert.equal(resolveCloudLoadTarget({ targetTabId: "cloud-1-1700", activeTabId: "canvas-1", tabIds }), "store");
  assert.equal(resolveCloudLoadTarget({ targetTabId: "cloud-1-1700", activeTabId: "canvas-1", tabIds: ["canvas-1"] }), "drop");
  assert.equal(resolveCloudLoadTarget({ targetTabId: "", activeTabId: "canvas-1", tabIds }), "drop");
  assert.equal(resolveCloudLoadTarget({ targetTabId: "x", activeTabId: "x", tabIds: null }), "drop");
});

test("issue 3: the load effect binds to its originating tab instead of the active tab at response time", () => {
  assert.ok(start > 0);
  assert.match(effect, /const targetTabId = cloudRestoringTabIdRef\.current \|\| activeCanvasIdRef\.current;/);
  assert.match(effect, /resolveCloudLoadTarget\(\{/);
  // The old code wrote the loaded snapshot to whatever tab was active.
  assert.doesNotMatch(effect, /tab\.id === activeCanvasIdRef\.current\s*\?\s*\{ \.\.\.tab, name: loadedCloudName/);
  assert.match(effect, /tab\.id === targetTabId \? patch\(tab\) : tab/);
});

test("issue 3: an abandoned load is retried and a cancelled ready-frame cannot leave onChange blocked", () => {
  const cleanup = effect.slice(effect.indexOf("return () => {\n      cancelled = true;"));
  assert.match(cleanup, /cloudLoadStartedRef\.current = false;/);
  assert.match(cleanup, /window\.cancelAnimationFrame\(readyFrame\);[\s\S]*cloudSceneReadyRef\.current = true;[\s\S]*cloudRestoringTabIdRef\.current = "";/);
});

test("issue 3: a failed load of a background tab does not overwrite the active tab's live state", () => {
  const catchBlock = effect.slice(effect.indexOf(".catch((error) => {"));
  assert.match(catchBlock, /if \(activeCanvasIdRef\.current === targetTabId\)/);
  assert.match(catchBlock, /updateTargetTab\(\(tab\) => \(\{ \.\.\.tab, snapshot: \{ \.\.\.tab\.snapshot, cloudSaveState: \{ state: "error"/);
});

test("issue 3: a failed startup refresh marks the cached cloud tab with a visible error", () => {
  const block = app.slice(app.indexOf("A cloud canvas could not be refreshed during startup"));
  assert.match(block.slice(0, 900), /cloudSaveState: \{ state: "error", error: "Could not refresh this diagram from Cloud Workspace/);
});
