import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SYSTEM_DESIGN_TAB_STATE,
  createSystemDesignWorkspaceByTabId,
  readSystemDesignTabState,
  updateSystemDesignWorkspaceTab,
  persistSystemDesignTabState,
} from "../systemDesignTabState.js";

test("System Design activation is isolated to its document tab", () => {
  const tabs = [
    { id: "tab-1", snapshot: { elements: [{ id: "node-1", type: "rectangle" }, { id: "edge-1", type: "arrow" }], systemDesign: { active: false, studioMode: "canvas", simRunning: false, baseRps: 10000, inspectorOpen: false } } },
    { id: "tab-2", snapshot: { elements: [], systemDesign: { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE } } },
  ];
  let workspaceByTabId = createSystemDesignWorkspaceByTabId(tabs, "tab-1");
  workspaceByTabId = updateSystemDesignWorkspaceTab(workspaceByTabId, "tab-1", {
    active: true, studioMode: "k8s", simRunning: true, baseRps: 50000, inspectorOpen: true,
  });

  assert.equal(workspaceByTabId["tab-1"].active, true);
  assert.equal(workspaceByTabId["tab-2"].active, false);
  assert.deepEqual(readSystemDesignTabState(tabs, "tab-2"), DEFAULT_SYSTEM_DESIGN_TAB_STATE);

  const persistedTabs = persistSystemDesignTabState(tabs, "tab-1", workspaceByTabId["tab-1"]);
  assert.deepEqual(readSystemDesignTabState(persistedTabs, "tab-1"), workspaceByTabId["tab-1"]);
  assert.deepEqual(readSystemDesignTabState(persistedTabs, "tab-2"), DEFAULT_SYSTEM_DESIGN_TAB_STATE);
  assert.deepEqual(persistedTabs[0].snapshot.elements.map((element) => element.id), ["node-1", "edge-1"], "tab graph elements remain attached to their document snapshot");

  const reloadedWorkspace = createSystemDesignWorkspaceByTabId(persistedTabs, "tab-2");
  assert.equal(reloadedWorkspace["tab-1"].active, true, "tab-1 studio mode survives IndexedDB tab reload");
  assert.equal(reloadedWorkspace["tab-2"].active, false, "tab-2 remains a standard canvas after reload");

  const tab2 = workspaceByTabId["tab-2"];
  assert.equal(tab2.active, false, "switching to tab-2 must hide the System Design bar");

  const restoredTab1 = workspaceByTabId["tab-1"];
  assert.equal(restoredTab1.active, true, "switching back restores the System Design bar");
  assert.equal(restoredTab1.studioMode, "k8s");
  assert.equal(restoredTab1.simRunning, true);
  assert.equal(restoredTab1.baseRps, 50000);
  assert.equal(restoredTab1.inspectorOpen, true);
});

test("new document tabs default to a clean Infinity canvas", () => {
  const map = createSystemDesignWorkspaceByTabId([{ id: "tab-1", snapshot: { systemDesign: { active: true } } }], "tab-2");
  assert.deepEqual(map["tab-2"], DEFAULT_SYSTEM_DESIGN_TAB_STATE);
});
