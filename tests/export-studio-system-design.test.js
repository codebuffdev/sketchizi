import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const header = read("src/components/app/DesktopAppHeader.jsx");
const app = read("src/App.jsx");
const modal = read("src/components/app/ExportStudioModal.jsx");
const nativeMenu = read("src/features/navigation/useNativeSketchiziMenu.js");

test("document tab popover restores Export Studio after Recovery backup", () => {
  const recovery = header.indexOf("<strong>Recovery backup</strong>");
  const studio = header.indexOf("<strong>Export studio...</strong>");
  assert.ok(header.includes("<h3>Export</h3>"));
  assert.ok(recovery >= 0 && studio > recovery);
  assert.ok(header.includes("aria-label="Export studio""));
  assert.ok(header.includes('aria-label="Export studio"'));
});

test("Export Studio subscribes to the active System Design graph and composes it into exports", () => {
  assert.ok(app.includes('const ExportStudioModal = lazy(() => import("./components/app/ExportStudioModal"));'));
  assert.ok(app.includes("systemDesignWorkspace = systemDesign"));
  assert.ok(app.includes("onOpenExportStudio={() => setExportStudioOpen(true)}"));
  assert.ok(modal.includes("useSyncExternalStore"));
  assert.ok(modal.includes("readGraph(snapshot.elements)"));
  assert.ok(modal.includes("simulateTraffic"));
  assert.ok(modal.includes("buildSystemDesignSvg"));
  assert.ok(modal.includes("isSystemDesignNode(element)"));
  assert.ok(modal.includes("isSystemDesignEdge(element)"));
  assert.ok(modal.includes("exportToSvg"));
  assert.ok(modal.includes("svgToCanvas"));
  assert.ok(modal.includes('new ClipboardItem({ "image/png": blob })'));
});

test("left native WORKSPACE menu continues to remove image export and canvas find", () => {
  assert.ok(nativeMenu.includes('new Set(["export image", "export image...", "export image…", "find on canvas"])'));
  assert.ok(nativeMenu.includes('if (key === "f")'));
  assert.ok(!nativeMenu.includes('key === "e" && event.shiftKey'));
  assert.ok(nativeMenu.includes('window.addEventListener("keydown", onKeyDown, true)'));
});
