import test from "node:test";
import assert from "node:assert/strict";
import { describeTabSync, findTabByCloudDocId, getTabCloudMeta } from "../src/features/workspace/tabCloudState.js";

const cloudTab = (id, diagramId, extra = {}) => ({ id, dirty: false, snapshot: { cloudDetached: false, cloudSession: { active: true, diagramId, revision: 3 }, cloudSaveState: { state: "saved", error: "" }, ...extra } });

test("each tab derives its own cloud identity and sync state", () => {
  const a = getTabCloudMeta(cloudTab("a", "doc-a"));
  const b = getTabCloudMeta(cloudTab("b", "doc-b", { cloudSaveState: { state: "error", error: "offline" } }));
  assert.deepEqual([a.cloudDocId, a.syncStatus, a.cloudVersion], ["doc-a", "synced", 3]);
  assert.deepEqual([b.cloudDocId, b.syncStatus, b.error], ["doc-b", "error", "offline"]);
});

test("local tabs report local source and dirty state", () => {
  const meta = getTabCloudMeta({ id: "l", dirty: true, snapshot: { cloudSession: { active: false } } });
  assert.equal(meta.sourceType, "local");
  assert.equal(meta.isDirty, true);
  assert.equal(meta.cloudDocId, null);
});

test("cloud edits mark only that tab dirty; live state overrides the stale snapshot", () => {
  const tab = cloudTab("a", "doc-a");
  assert.equal(getTabCloudMeta(tab).syncStatus, "synced");
  assert.equal(getTabCloudMeta(tab, { dirty: true, cloudSaveState: { state: "saving", error: "" } }).syncStatus, "syncing");
  assert.equal(getTabCloudMeta(tab, { dirty: true, cloudSaveState: { state: "saved", error: "" } }).syncStatus, "dirty");
});

test("findTabByCloudDocId focuses an existing tab and ignores detached ones", () => {
  const tabs = [cloudTab("a", "doc-a"), cloudTab("b", "doc-b", { cloudDetached: true })];
  assert.equal(findTabByCloudDocId(tabs, "doc-a").id, "a");
  assert.equal(findTabByCloudDocId(tabs, "doc-b"), null);
  assert.equal(findTabByCloudDocId(tabs, ""), null);
  assert.match(describeTabSync(getTabCloudMeta(tabs[0])), /Synced/);
});
