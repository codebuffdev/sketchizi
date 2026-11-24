import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerExportStudioShortcut } from "../src/features/navigation/exportStudioShortcut.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function dispatchShortcut({ ctrlKey = false, metaKey = false, shiftKey = true, key = "E", target = {} } = {}) {
  let listener;
  let capture;
  const host = {
    addEventListener(type, callback, useCapture) { assert.equal(type, "keydown"); listener = callback; capture = useCapture; },
    removeEventListener(type, callback, useCapture) { assert.equal(callback, listener); assert.equal(useCapture, true); },
  };
  let prevented = false;
  let stopped = false;
  let immediateStopped = false;
  let opened = 0;
  const cleanup = registerExportStudioShortcut({ target: host, openExportStudio: () => { opened += 1; } });
  listener({
    ctrlKey, metaKey, shiftKey, key, target,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { immediateStopped = true; },
  });
  return { capture, prevented, stopped, immediateStopped, opened, cleanup };
}

test("Ctrl+Shift+E opens Export Studio in capture phase and blocks Excalidraw's default export", () => {
  const result = dispatchShortcut({ ctrlKey: true });
  assert.equal(result.capture, true);
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);
  assert.equal(result.immediateStopped, true);
  assert.equal(result.opened, 1);
  result.cleanup();
});

test("Cmd+Shift+E opens Export Studio on macOS and blocks the default export", () => {
  const result = dispatchShortcut({ metaKey: true });
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);
  assert.equal(result.opened, 1);
  result.cleanup();
});

test("typing in an input, textarea, or contenteditable does not steal the shortcut", () => {
  for (const selector of ["input", "textarea", '[contenteditable="true"]']) {
    const result = dispatchShortcut({ ctrlKey: true, target: { closest: (query) => query.includes(selector) ? {} : null } });
    assert.equal(result.opened, 0);
    assert.equal(result.prevented, false);
    result.cleanup();
  }
});

test("App wires the global shortcut to the same Export Studio modal and active tab graph", () => {
  const app = read("src/App.jsx");
  const modal = read("src/components/app/ExportStudioModal.jsx");
  const workspace = read("src/features/system-design/useSystemDesignWorkspace.js");
  assert.ok(app.includes("registerExportStudioShortcut({ openExportStudio: () => setExportStudioOpen(true) })"));
  const shortcut = read("src/features/navigation/exportStudioShortcut.js");
  const nativeMenu = read("src/features/navigation/useNativeSketchiziMenu.js");
  assert.ok(shortcut.includes('target.addEventListener("keydown", onKeyDown, true)'));
  assert.ok(nativeMenu.includes('if (key === "f")'));
  assert.ok(!nativeMenu.includes('key === "e" && event.shiftKey'));
  assert.ok(workspace.includes("activeTabId: activeCanvasId, workspaceByTabId"));
  assert.ok(modal.includes("workspace?.workspaceByTabId?.[activeTabId]"));
  assert.ok(modal.includes("readGraph(snapshot.elements)"));
  assert.ok(modal.includes("buildSystemDesignSvg"));
});
