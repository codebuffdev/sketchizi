import test from "node:test";
import assert from "node:assert/strict";
import { createHintTimer, isEditableTarget, isPasteAsSingleElementShortcut, PASTE_HINT_PATTERN, PASTE_HINT_MS } from "../src/features/canvas/pasteHintGuard.js";

test("matches Excalidraw's hint text across Ctrl/Cmd wording and line breaks", () => {
  assert.ok(PASTE_HINT_PATTERN.test("Use Ctrl+Shift+V to paste as a single element,\nor paste into an existing text editor"));
  assert.ok(PASTE_HINT_PATTERN.test("Use ⌘+Shift+V to paste as a single element"));
  assert.ok(!PASTE_HINT_PATTERN.test("Saved to Cloud Workspace"));
});
test("single timer: restarting never leaks the previous timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let expired = 0;
  const timer = createHintTimer({ onExpire: () => { expired += 1; } });
  for (let i = 0; i < 5; i += 1) { timer.start(); t.mock.timers.tick(1000); } // spam Ctrl+V
  assert.equal(expired, 0);
  assert.ok(timer.active());
  t.mock.timers.tick(PASTE_HINT_MS);
  assert.equal(expired, 1); // exactly one dismissal for five pastes
  assert.equal(timer.active(), false);
  timer.start(); timer.cancel();
  t.mock.timers.tick(PASTE_HINT_MS * 2);
  assert.equal(expired, 1); // cancel (unmount / dismiss) really stops it
});
test("editor targets and the paste-as-single-element shortcut", () => {
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: "CANVAS", closest: () => null }), false);
  assert.equal(isEditableTarget(null), false);
  assert.equal(isPasteAsSingleElementShortcut({ ctrlKey: true, shiftKey: true, key: "V" }), true);
  assert.equal(isPasteAsSingleElementShortcut({ metaKey: true, shiftKey: true, key: "v" }), true);
  assert.equal(isPasteAsSingleElementShortcut({ ctrlKey: true, shiftKey: false, key: "v" }), false);
});
