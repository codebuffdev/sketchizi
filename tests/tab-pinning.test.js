import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_PINNED_TABS,
  PIN_LIMIT_MESSAGE,
  buildSwitchOrder,
  classifyTabSwitchKey,
  countPinnedTabs,
  getActiveWorkspaceTabId,
  getAdjacentTabId,
  orderTabsByPin,
  togglePinTab,
} from "../src/features/workspace/tabPinning.js";

const tab = (id, extra = {}) => ({ id, name: id.toUpperCase(), ...extra });
const ids = (tabs) => tabs.map((t) => t.id);

test("pin cap is 2 and the refusal message is the agreed copy", () => {
  assert.equal(MAX_PINNED_TABS, 2);
  assert.equal(PIN_LIMIT_MESSAGE, "Maximum 2 pinned tabs allowed — unpin one first");
});

test("pinning moves the tab into the pinned group at the far left", () => {
  const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
  const first = togglePinTab(tabs, "c");
  assert.equal(first.status, "pinned");
  assert.deepEqual(ids(first.tabs), ["c", "a", "b", "d"]);
  const second = togglePinTab(first.tabs, "d");
  assert.equal(second.status, "pinned");
  assert.deepEqual(ids(second.tabs), ["c", "d", "a", "b"]);
});

test("a third pin is refused and leaves the list untouched", () => {
  const tabs = [tab("a", { pinned: true }), tab("b", { pinned: true }), tab("c")];
  const result = togglePinTab(tabs, "c");
  assert.equal(result.status, "limit");
  assert.equal(result.tabs, tabs);
  assert.equal(countPinnedTabs(result.tabs), 2);
});

test("unpinning frees a slot and returns the tab to the unpinned group", () => {
  const tabs = [tab("a", { pinned: true }), tab("b", { pinned: true }), tab("c")];
  const unpinned = togglePinTab(tabs, "a");
  assert.equal(unpinned.status, "unpinned");
  assert.deepEqual(ids(unpinned.tabs), ["b", "a", "c"]);
  assert.equal(togglePinTab(unpinned.tabs, "c").status, "pinned");
});

test("unknown ids and Todo views cannot be pinned", () => {
  const tabs = [tab("a"), tab("todo:a", { isTodoTab: true })];
  assert.equal(togglePinTab(tabs, "nope").status, "missing");
  assert.equal(togglePinTab(tabs, "todo:a").status, "missing");
});

test("orderTabsByPin repairs a stored list that exceeds the cap", () => {
  const tabs = [tab("a"), tab("b", { pinned: true }), tab("c", { pinned: true }), tab("d", { pinned: true })];
  const ordered = orderTabsByPin(tabs);
  assert.deepEqual(ids(ordered), ["b", "c", "a", "d"]);
  assert.equal(countPinnedTabs(ordered), 2);
  assert.equal(ordered.find((t) => t.id === "d").pinned, false);
});

test("orderTabsByPin keeps relative order inside each group", () => {
  const tabs = [tab("a"), tab("b", { pinned: true }), tab("c"), tab("d", { pinned: true }), tab("e")];
  assert.deepEqual(ids(orderTabsByPin(tabs)), ["b", "d", "a", "c", "e"]);
});

test("switch order is pinned first, and a Todo view follows its canvas", () => {
  const tabs = [tab("a"), tab("b", { pinned: true, todoTabOpen: true }), tab("c")];
  const order = buildSwitchOrder(tabs);
  assert.deepEqual(ids(order), ["b", "todo:b", "a", "c"]);
  assert.deepEqual(order.map((t) => t.pinned), [true, false, false, false]);
});

test("Ctrl+Tab advances with wrap-around; Ctrl+Shift+Tab goes back with wrap-around", () => {
  const order = buildSwitchOrder([tab("p", { pinned: true }), tab("a"), tab("b")]);
  assert.equal(getAdjacentTabId(order, "p", 1), "a");
  assert.equal(getAdjacentTabId(order, "a", 1), "b");
  assert.equal(getAdjacentTabId(order, "b", 1), "p");
  assert.equal(getAdjacentTabId(order, "p", -1), "b");
  assert.equal(getAdjacentTabId(order, "b", -1), "a");
});

test("cycling from an unknown active id starts at the right end", () => {
  const order = buildSwitchOrder([tab("a"), tab("b"), tab("c")]);
  assert.equal(getAdjacentTabId(order, "gone", 1), "a");
  assert.equal(getAdjacentTabId(order, "gone", -1), "c");
  assert.equal(getAdjacentTabId([], "a", 1), null);
});

test("the active workspace id is the Todo view only while it is the active one", () => {
  const tabs = [tab("a", { todoTabOpen: true, todoTabActive: true }), tab("b", { todoTabOpen: true })];
  assert.equal(getActiveWorkspaceTabId(tabs, "a"), "todo:a");
  assert.equal(getActiveWorkspaceTabId(tabs, "b"), "b");
});

test("shortcut chords: Ctrl+Tab, Ctrl+Shift+Tab and the bracket fallbacks", () => {
  assert.deepEqual(classifyTabSwitchKey({ ctrlKey: true, key: "Tab" }), { direction: 1, fallback: false });
  assert.deepEqual(classifyTabSwitchKey({ ctrlKey: true, shiftKey: true, key: "Tab" }), { direction: -1, fallback: false });
  assert.deepEqual(classifyTabSwitchKey({ ctrlKey: true, key: "]" }), { direction: 1, fallback: true });
  assert.deepEqual(classifyTabSwitchKey({ ctrlKey: true, key: "[" }), { direction: -1, fallback: true });
  assert.equal(classifyTabSwitchKey({ key: "Tab" }), null);
  assert.equal(classifyTabSwitchKey({ ctrlKey: true, altKey: true, key: "Tab" }), null);
  assert.equal(classifyTabSwitchKey({ ctrlKey: true, metaKey: true, key: "Tab" }), null);
  assert.equal(classifyTabSwitchKey({ ctrlKey: true, key: "n" }), null);
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the switcher hook listens on window in the capture phase and swallows the chord", () => {
  const source = read("../src/hooks/useTabSwitcher.js");
  assert.match(source, /addEventListener\("keydown", onKeyDown, \{ capture: true \}\)/);
  assert.match(source, /event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
  assert.match(source, /event\.key === "Control"/);
  assert.match(source, /SWITCHER_IDLE_MS/);
  assert.match(read("../src/features/workspace/tabPinning.js"), /SWITCHER_IDLE_MS = 900/);
});

test("tab bar hides the close button on pinned tabs and offers the context menu", () => {
  const source = read("../src/components/app/CanvasTabs.jsx");
  assert.match(source, /onClose && !pinned &&/);
  assert.match(source, /Unpin tab/);
  assert.match(source, /Pin tab/);
  assert.match(source, /aria-label="Switch Tab"/);
  assert.match(source, /Pinned/);
});

test("the workspace hook enforces ordering, close protection and per-tab view restore", () => {
  const source = read("../src/hooks/useWorkspaceTabs.js");
  assert.match(source, /orderTabsByPin\(nextTabs\)/);
  assert.match(source, /if \(tab\.pinned\)/);
  assert.match(source, /togglePinCanvasTab/);
  assert.match(source, /hasStoredView/);
});
