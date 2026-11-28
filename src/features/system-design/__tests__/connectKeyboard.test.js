import test from "node:test";
import assert from "node:assert/strict";
import { isConnectKeyBlockedTarget, isConnectKeyEvent, resolveConnectKeyAction } from "../connectKeyboard.js";
import { isCodeBlockShortcut, registerPlainCKeyClaim } from "../../canvas/codeBlock/codeBlockShortcut.js";

const nodes = new Set(["n1", "n2", "n3"]);
const isNode = (id) => nodes.has(id);
const key = (extra = {}) => ({ key: "c", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: null, ...extra });

test("C with a selected card arms that card", () => {
  assert.deepEqual(resolveConnectKeyAction({ selectedIds: ["n3"], isNode, hoverId: null }), { type: "arm", sourceId: "n3" });
});

test("C with no selection arms the hovered card", () => {
  assert.deepEqual(resolveConnectKeyAction({ selectedIds: [], isNode, hoverId: "n2" }), { type: "arm", sourceId: "n2" });
});

test("selection stays authoritative over an unrelated hovered card", () => {
  assert.deepEqual(resolveConnectKeyAction({ selectedIds: ["n1"], isNode, hoverId: "n2" }), { type: "arm", sourceId: "n1" });
});

test("C with an unrelated previously selected card arms that selected card, not the hovered one", () => {
  assert.equal(resolveConnectKeyAction({ selectedIds: ["n2"], isNode, hoverId: "n3" }).sourceId, "n2");
});

test("two selected cards connect the first to the second", () => {
  assert.deepEqual(resolveConnectKeyAction({ selectedIds: ["n1", "n3"], isNode, hoverId: null }), { type: "connect", fromId: "n1", toId: "n3" });
});

test("C is not ours when nothing usable is selected or hovered, or a non-card is selected", () => {
  assert.equal(resolveConnectKeyAction({ selectedIds: [], isNode, hoverId: null }), null);
  assert.equal(resolveConnectKeyAction({ selectedIds: ["edge-1"], isNode, hoverId: "n1" }), null);
});

test("only a plain C counts, and typing targets are excluded", () => {
  assert.equal(isConnectKeyEvent(key()), true);
  assert.equal(isConnectKeyEvent(key({ key: "C" })), true);
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(isConnectKeyEvent(key({ [modifier]: true })), false);
  assert.equal(isConnectKeyEvent(key({ key: "v" })), false);
  const target = (matches) => ({ closest: () => (matches ? {} : null) });
  assert.equal(isConnectKeyBlockedTarget(target(true)), true);
  assert.equal(isConnectKeyBlockedTarget(target(false)), false);
  assert.equal(isConnectKeyBlockedTarget(null), false);
});

test("Code Block C steps aside only while a claim covers the keypress, and again once it is removed", () => {
  const event = key();
  assert.equal(isCodeBlockShortcut(event), true, "Code Block keeps plain C when nothing claims it");
  let claimed = true;
  const unregister = registerPlainCKeyClaim(() => claimed);
  assert.equal(isCodeBlockShortcut(event), false, "claimed C must reach the owning feature");
  claimed = false;
  assert.equal(isCodeBlockShortcut(event), true, "an unclaimed C still activates the Code Block tool");
  claimed = true;
  unregister();
  assert.equal(isCodeBlockShortcut(event), true, "unregistering restores the Code Block shortcut");
});

test("a throwing claim never disables the Code Block shortcut", () => {
  const unregister = registerPlainCKeyClaim(() => { throw new Error("boom"); });
  assert.equal(isCodeBlockShortcut(key()), true);
  unregister();
});
