import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("canvas plus button opens a three-mode picker with accessible keyboard navigation", () => {
  const tabs = read("../src/components/app/CanvasTabs.jsx");
  for (const value of ["aria-haspopup=\"menu\"", "NEW CANVAS", "Infinity", "Pages", "System Design", "ArrowDown", "ArrowUp", "closeOnOutsideInteraction"]) {
    assert.ok(tabs.includes(value), value);
  }
  assert.ok(tabs.includes('onCreate?.({ type: option.type, mode: option.mode })'));
});

test("new canvas modes persist independently and System Design starts enabled", () => {
  const hook = read("../src/hooks/useWorkspaceTabs.js");
  assert.ok(hook.includes('const isPagesTab = requestedType === "pages"'));
  assert.ok(hook.includes('const requestedMode = requestedType === "canvas" ? "infinity" : requestedType'));
  assert.ok(hook.includes('type: isPagesTab ? "pages" : requestedType'));
  assert.ok(hook.includes("mode: requestedMode"));
  assert.ok(hook.includes("isSystemDesignTab ? { active: true } : {}"));
  assert.ok(hook.includes("isPagesTab ? createDefaultPagesSnapshot(apiRef.current)"));
  const systemDesign = read("../src/features/system-design/useSystemDesignWorkspace.js");
  assert.ok(systemDesign.includes("Hydrate it from its persisted snapshot"));
  assert.ok(systemDesign.includes("readSystemDesignTabState(canvasTabsRef?.current || [], activeCanvasId)"));
});

test("new canvas picker uses compact tab-bar styling and sits below the plus control", () => {
  const styles = read("../src/styles/canvas-tabs.css");
  assert.ok(styles.includes(".canvas-tabs-create-wrap { position:relative"));
  assert.ok(styles.includes("top:calc(100% + 8px); right:0; z-index:50"));
  assert.ok(styles.includes(".canvas-tabs-create-option:focus-visible"));
  assert.ok(styles.includes(".app.theme-dark .canvas-tabs-create-menu"));
});

test("New Canvas picker is portaled above Page headers and anchored to the plus trigger", () => {
  const tabs = read("../src/components/app/CanvasTabs.jsx");
  const styles = read("../src/styles/canvas-tabs.css");
  assert.ok(tabs.includes("createPortal("));
  assert.ok(tabs.includes("document.body"));
  assert.ok(tabs.includes("trigger.getBoundingClientRect()"));
  assert.ok(tabs.includes("rect.bottom + 7"));
  assert.ok(tabs.includes("viewportWidth - menuWidth - 8"));
  assert.ok(tabs.includes("createMenuRef.current?.contains(event.target)"));
  assert.ok(styles.includes(".canvas-tabs-create-menu-portal"));
  assert.ok(styles.includes("position: fixed !important"));
  assert.ok(styles.includes("z-index: 1200 !important"));
});
