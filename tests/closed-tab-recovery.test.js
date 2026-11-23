import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_CLOSED_TABS, buildClosedTabRecord, pushClosedTab, removeClosedTab, restoreClosedTab,
  normalizeClosedTabs, snapshotHasContent, isTabBackedByFileOrCloud, describeClosedAt,
} from "../src/features/workspace/closedTabs.js";
import { getTabCloudMeta, describeTabSync, getTabStatusClass, BROWSER_DRAFT_LABEL } from "../src/features/workspace/tabCloudState.js";
import { readAppSourceSync } from "./helpers/app-source.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const el = (id, extra = {}) => ({ id, type: "rectangle", isDeleted: false, ...extra });
const tab = (id, elements, extra = {}) => ({
  id, name: `Canvas ${id}`, dirty: true, todoItems: [{ id: "t1" }],
  snapshot: { elements, appState: { viewBackgroundColor: "#fff" }, files: { f1: { id: "f1" } }, metadata: {}, extensions: {}, format: "excalidraw", file: null,
    cloudSession: { active: false }, cloudDetached: true, ...extra },
});

test("tab status never calls a browser draft saved", () => {
  const draft = getTabCloudMeta(tab("a", [el("1")]));
  assert.equal(draft.syncStatus, "draft");
  assert.equal(describeTabSync(draft), BROWSER_DRAFT_LABEL);
  assert.match(BROWSER_DRAFT_LABEL, /not saved to file/i);
  assert.equal(getTabStatusClass(draft), "is-draft");
  assert.notEqual(getTabStatusClass(draft), "is-saved");
});

test("green is reserved for file- or cloud-backed tabs", () => {
  const file = getTabCloudMeta(tab("a", [el("1")], { file: { id: "f", name: "x.sketchizi" } }), { dirty: false });
  assert.equal(describeTabSync(file), "Saved to disk");
  assert.equal(getTabStatusClass(file), "is-saved");
  const dirtyFile = getTabCloudMeta(tab("a", [el("1")], { file: { id: "f" } }), { dirty: true });
  assert.equal(getTabStatusClass(dirtyFile), "is-pending");
  const cloud = getTabCloudMeta(tab("c", [el("1")], { cloudSession: { active: true, diagramId: "d1" }, cloudDetached: false, cloudSaveState: { state: "saved" } }), { dirty: false });
  assert.equal(getTabStatusClass(cloud), "is-saved");
});

test("empty or fully deleted canvases are not archived", () => {
  assert.equal(buildClosedTabRecord(tab("a", [])), null);
  assert.equal(buildClosedTabRecord(tab("a", [el("1", { isDeleted: true })])), null);
  assert.equal(snapshotHasContent({ elements: [el("1")] }), true);
});

test("active empty System Design tabs are archived and recover their exact studio state", () => {
  const systemDesign = { active: true, studioMode: "compose", simRunning: true, baseRps: 50000, inspectorOpen: true };
  const source = { elements: [], systemDesign, appState: {}, files: {}, metadata: {}, extensions: {}, format: "excalidraw" };
  assert.equal(snapshotHasContent(source), true);
  const record = buildClosedTabRecord({ id: "studio", name: "Canvas Studio", snapshot: source }, source, 10);
  assert.deepEqual(record.snapshot.systemDesign, systemDesign);
  const restored = restoreClosedTab(record, [], 20);
  assert.deepEqual(restored.snapshot.systemDesign, systemDesign);
});

test("a closed record keeps elements, appState, files, title and a timestamp", () => {
  const record = buildClosedTabRecord(tab("a", [el("1"), el("2")]), null, 1000);
  assert.equal(record.closedAt, 1000);
  assert.equal(record.name, "Canvas a");
  assert.equal(record.snapshot.elements.length, 2);
  assert.deepEqual(record.snapshot.files, { f1: { id: "f1" } });
  assert.equal(record.snapshot.appState.viewBackgroundColor, "#fff");
  assert.deepEqual(record.tab.todoItems, [{ id: "t1" }]);
  assert.equal("snapshot" in record.tab, false, "shell must not duplicate the snapshot");
});

test("the live snapshot wins over the stale stored one", () => {
  const live = { elements: [el("live")] };
  assert.equal(buildClosedTabRecord(tab("a", [el("old")]), live).snapshot.elements[0].id, "live");
});

test("closed drafts detach from files and cloud documents", () => {
  const record = buildClosedTabRecord(tab("a", [el("1")], { file: { id: "f" }, cloudSession: { active: true, diagramId: "d" }, cloudDetached: false }));
  assert.equal(record.snapshot.file, null);
  assert.equal(record.snapshot.cloudSession.active, false);
  assert.equal(record.snapshot.cloudDetached, true);
  assert.equal(isTabBackedByFileOrCloud({ file: { id: "f" } }), true);
  assert.equal(isTabBackedByFileOrCloud({ cloudSession: { active: true, diagramId: "d" }, cloudDetached: false }), true);
  assert.equal(isTabBackedByFileOrCloud({ file: null, cloudSession: { active: false } }), false);
});

test("the list keeps the newest 15, newest first, without duplicates", () => {
  assert.ok(MAX_CLOSED_TABS >= 10 && MAX_CLOSED_TABS <= 15);
  let list = [];
  for (let i = 1; i <= 20; i += 1) list = pushClosedTab(list, buildClosedTabRecord(tab(String(i), [el("1")]), null, i));
  assert.equal(list.length, MAX_CLOSED_TABS);
  assert.equal(list[0].originalId, "20");
  assert.equal(list.at(-1).originalId, String(20 - MAX_CLOSED_TABS + 1));
  assert.equal(pushClosedTab(list, list[0]).length, MAX_CLOSED_TABS, "re-pushing the same record does not duplicate it");
  assert.equal(removeClosedTab(list, list[0].closedId).length, MAX_CLOSED_TABS - 1);
});

test("restoring gives a unique id, the saved title and a dirty browser draft", () => {
  const record = buildClosedTabRecord(tab("a", [el("1")]), null, 5);
  const restored = restoreClosedTab(record, ["canvas-1000", "canvas-1000-2"], 1000);
  assert.equal(restored.id, "canvas-1000-3");
  assert.equal(restored.name, "Canvas a");
  assert.equal(restored.dirty, true);
  assert.equal(restored.snapshot.elements.length, 1);
  assert.equal(restoreClosedTab(null), null);
});

test("malformed stored entries are dropped after a reload", () => {
  const good = buildClosedTabRecord(tab("a", [el("1")]), null, 7);
  assert.deepEqual(normalizeClosedTabs([null, {}, { closedId: "x" }, good]).map((r) => r.closedId), [good.closedId]);
  assert.deepEqual(normalizeClosedTabs(undefined), []);
});

test("relative closed-at labels", () => {
  assert.equal(describeClosedAt({ closedAt: 0 }, 30_000), "Closed just now");
  assert.equal(describeClosedAt({ closedAt: 0 }, 5 * 60_000), "Closed 5 min ago");
  assert.equal(describeClosedAt({ closedAt: 0 }, 3 * 3_600_000), "Closed 3 hr ago");
});

test("wiring: App archives before closing, offers the 6s toast, and binds Ctrl/Cmd+Shift+T", () => {
  const app = readAppSourceSync();
  const start = app.indexOf("const performCloseCanvasTab");
  const body = app.slice(start, app.indexOf("const closeCanvasTab", start));
  assert.ok(body.indexOf("archiveClosedTab(tabId)") > 0, "close must archive the tab");
  assert.ok(body.indexOf("archiveClosedTab(tabId)") < body.indexOf("returnToWelcomeScreen()"), "archive before the welcome reset clears the scene");
  assert.ok(body.indexOf("archiveClosedTab(tabId)") < body.indexOf("switchCanvasTab("), "archive before the tab switch");
  assert.match(app, /\}, 6000\);/, "toast stays for 6 seconds");
  assert.match(app, /Reopen Tab/);
  assert.match(app, /event\.shiftKey[\s\S]{0,120}key\.toLowerCase\(\) !== "t"/);
  assert.match(app, /keepDraft: false/, "Discard must skip archiving");
  assert.match(app, /Close &amp; keep in Local Drafts/);
  assert.match(app, /Don’t ask again for local drafts/);
  assert.match(app, /skipDraftPromptRef\.current/);
});

test("wiring: recovery entry points exist in tab bar, startup chooser, hamburger menu and command palette", () => {
  assert.match(read("../src/components/app/CanvasTabs.jsx"), /Recently closed/);
  assert.match(readAppSourceSync(), /Local drafts · recently closed/);
  assert.match(read("../src/features/navigation/useNativeSketchiziMenu.js"), /data-closed-tabs-list/);
  const registry = read("../src/features/commands/commandRegistry.js");
  assert.match(registry, /files\.reopen-closed-tab/);
  assert.match(registry, /Ctrl\+Shift\+T/);
});

test("wiring: persistence stores closed tabs and the preference persists", () => {
  const persistence = read("../src/persistence.js");
  assert.match(persistence, /export async function loadClosedTabs/);
  assert.match(persistence, /export async function saveClosedTabs/);
  assert.match(read("../src/features/navigation/useSketchiziPreferences.js"), /sketchizi-skip-local-draft-prompt/);
});
