import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TOOL_STYLE_PRESETS,
  PRESET_TOOL_KEYS,
  createToolStylePresetStore,
  filterStyleForTool,
  normalizeToolKey,
  sanitizeCanvasToolStyleState,
  stylePatchToAppState,
} from "../src/features/canvas/toolStylePresets.js";
import { createToolStyleController } from "../src/features/canvas/toolStyleController.js";
import { prepareTabsForPersistence } from "../src/features/workspace/tabSnapshot.js";
import { readAppSourceSync } from "./helpers/app-source.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const flushMicrotasks = () => new Promise((resolve) => queueMicrotask(resolve));

// ---------------------------------------------------------------- pure rules

test("tool keys normalize and non-drawing tools are ignored", () => {
  assert.deepEqual(PRESET_TOOL_KEYS, ["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text"]);
  assert.equal(normalizeToolKey("LINE"), "line");
  assert.equal(normalizeToolKey("draw"), "freedraw");
  for (const type of ["selection", "eraser", "hand", "image", "frame", "laser", "highlighter", "bucket-fill", "", undefined]) {
    assert.equal(normalizeToolKey(type), null, String(type));
  }
});

test("line and arrow defaults match the spec and do not leak fills or arrowheads", () => {
  assert.deepEqual(
    { ...DEFAULT_TOOL_STYLE_PRESETS.line },
    {
      strokeColor: "#1e1e1e", backgroundColor: "transparent", strokeWidth: 2, strokeStyle: "solid",
      roughness: 1, opacity: 100, startArrowhead: null, endArrowhead: null, lineGeometry: "straight",
    },
  );
  assert.equal(DEFAULT_TOOL_STYLE_PRESETS.arrow.endArrowhead, "arrow");
  assert.equal(DEFAULT_TOOL_STYLE_PRESETS.arrow.startArrowhead, null);
  assert.deepEqual({ ...DEFAULT_TOOL_STYLE_PRESETS.rectangle.roundness }, { type: 3 });
  assert.equal(DEFAULT_TOOL_STYLE_PRESETS.text.fontFamily, undefined, "canvas font preference stays owned by the scene hook");
  assert.throws(() => { "use strict"; DEFAULT_TOOL_STYLE_PRESETS.line.strokeColor = "red"; });
});

test("each tool only remembers properties that make sense for it", () => {
  const everything = {
    strokeColor: "#e03131", backgroundColor: "#a8c7e5", fillStyle: "hachure", strokeWidth: 1, strokeStyle: "dashed",
    roughness: 0, opacity: 50, roundness: { type: 3 }, startArrowhead: "dot", endArrowhead: "bar",
    fontFamily: 8, fontSize: 28, textAlign: "center", pressure: false, lineGeometry: "curved", x: 10, points: [[0, 0]],
  };
  assert.deepEqual(Object.keys(filterStyleForTool("text", everything)).sort(), ["fontFamily", "fontSize", "opacity", "strokeColor", "textAlign"]);
  assert.deepEqual(Object.keys(filterStyleForTool("freedraw", everything)).sort(), ["backgroundColor", "opacity", "pressure", "strokeColor", "strokeWidth"]);
  assert.ok(!("fontFamily" in filterStyleForTool("line", everything)));
  assert.ok(!("startArrowhead" in filterStyleForTool("rectangle", everything)));
  assert.ok(!("roundness" in filterStyleForTool("ellipse", everything)));
  assert.ok("roundness" in filterStyleForTool("rectangle", everything));
  assert.ok(!("x" in filterStyleForTool("line", everything)) && !("points" in filterStyleForTool("line", everything)));
});

test("invalid values are dropped instead of stored", () => {
  assert.deepEqual(filterStyleForTool("line", { strokeStyle: "wavy", strokeWidth: -1, opacity: "abc", strokeColor: "", roughness: 9 }), {});
  assert.deepEqual(filterStyleForTool("line", { strokeWidth: "1", opacity: 150 }), { strokeWidth: 1, opacity: 100 });
  assert.deepEqual(filterStyleForTool("arrow", { startArrowhead: "none", endArrowhead: "bogus" }), { startArrowhead: null });
});

test("style patches map onto Excalidraw currentItem* appState", () => {
  const appState = stylePatchToAppState({
    strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed", roughness: 0, opacity: 60,
    backgroundColor: "transparent", fillStyle: "solid", startArrowhead: null, endArrowhead: "arrow",
    fontFamily: 5, fontSize: 28, textAlign: "right", verticalAlign: "top", pressure: false, lineGeometry: "elbow",
  });
  assert.deepEqual(appState, {
    currentItemStrokeColor: "#e03131",
    currentItemStrokeWidth: 1,
    currentItemStrokeWidthKey: "thin", // free-draw engine reads the key, not the number
    currentItemStrokeStyle: "dashed",
    currentItemRoughness: 0,
    currentItemOpacity: 60,
    currentItemBackgroundColor: "transparent",
    currentItemFillStyle: "solid",
    currentItemStartArrowhead: null,
    currentItemEndArrowhead: "arrow",
    currentItemFontFamily: 5,
    currentItemFontSize: 28,
    currentItemTextAlign: "right",
    currentItemVerticalAlign: "top",
    currentItemPressure: false,
    currentItemLineGeometry: "elbow",
    currentItemArrowType: "elbow", // what Excalidraw reads when it creates the next arrow
  });
});

test("roundness is converted between element form and Excalidraw appState form", () => {
  assert.equal(stylePatchToAppState({ roundness: { type: 3 } }).currentItemRoundness, "round");
  assert.equal(stylePatchToAppState({ roundness: null }).currentItemRoundness, "sharp");
  assert.equal(stylePatchToAppState({ roundness: "round" }).currentItemRoundness, "round");
  assert.deepEqual(filterStyleForTool("rectangle", { roundness: "round" }), { roundness: { type: 3 } });
  assert.deepEqual(filterStyleForTool("rectangle", { roundness: "sharp" }), { roundness: null });
});

// ------------------------------------------------------------------- store

test("checklist: line keeps red/1px/dashed while rectangle keeps blue/4px/solid", () => {
  const store = createToolStylePresetStore();
  store.record("canvas-1", "line", { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  store.record("canvas-1", "rectangle", { strokeColor: "#1971c2", strokeWidth: 4, strokeStyle: "solid" });

  const line = store.resolve("canvas-1", "line");
  assert.equal(line.strokeColor, "#e03131");
  assert.equal(line.strokeWidth, 1);
  assert.equal(line.strokeStyle, "dashed");
  assert.equal(line.endArrowhead, null);
  assert.equal(line.backgroundColor, "transparent", "rectangle fill must not leak into lines");

  const rectangle = store.resolve("canvas-1", "rectangle");
  assert.equal(rectangle.strokeColor, "#1971c2");
  assert.equal(rectangle.strokeWidth, 4);
  assert.equal(rectangle.strokeStyle, "solid");
});

test("later edits merge into the preset instead of replacing it", () => {
  const store = createToolStylePresetStore();
  store.record("c", "line", { strokeColor: "#e03131" });
  store.record("c", "line", { strokeWidth: 1 });
  store.record("c", "line", { strokeStyle: "dashed" });
  assert.deepEqual(store.get("c", "line"), { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
});

test("checklist: editing an existing line (green/2px) updates what the Line tool restores", () => {
  const store = createToolStylePresetStore();
  store.record("c", "line", { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  store.record("c", "line", { strokeColor: "#2f9e44", strokeWidth: 2 });
  const line = store.resolve("c", "line");
  assert.equal(line.strokeColor, "#2f9e44");
  assert.equal(line.strokeWidth, 2);
  assert.equal(line.strokeStyle, "dashed", "untouched properties are kept");
});

test("each canvas remembers its own presets", () => {
  const store = createToolStylePresetStore();
  store.record("canvas-1", "line", { strokeColor: "#e03131" });
  store.record("canvas-2", "line", { strokeColor: "#2f9e44" });
  assert.equal(store.get("canvas-1", "line").strokeColor, "#e03131");
  assert.equal(store.get("canvas-2", "line").strokeColor, "#2f9e44");
  assert.equal(store.get("canvas-3", "line"), undefined);
  assert.equal(store.resolve("canvas-3", "line").strokeColor, "#1e1e1e");
  store.remove("canvas-1");
  assert.equal(store.get("canvas-1", "line"), undefined);
});

test("non-drawing tools never create or change presets", () => {
  const store = createToolStylePresetStore();
  assert.equal(store.record("c", "selection", { strokeColor: "#000000" }), null);
  assert.equal(store.record("c", "eraser", { strokeColor: "#000000" }), null);
  assert.equal(store.record("c", "line", { fontSize: 40 }), null);
  assert.equal(store.has("c"), false);
});

test("canvas appearance supplies fallback roughness and clears remembered roughness only", () => {
  const store = createToolStylePresetStore();
  store.ensureBaseRoughness("c", 0);
  store.ensureBaseRoughness("c", 2); // first value wins
  assert.equal(store.resolve("c", "rectangle").roughness, 0);
  assert.equal(store.resolve("c", "freedraw").roughness, undefined);

  store.record("c", "line", { roughness: 2, strokeColor: "#e03131", strokeStyle: "dashed" });
  assert.equal(store.resolve("c", "line").roughness, 2);

  store.setCanvasRoughness("c", 1);
  const line = store.resolve("c", "line");
  assert.equal(line.roughness, 1);
  assert.equal(line.strokeColor, "#e03131");
  assert.equal(line.strokeStyle, "dashed");
});

test("explicit colours survive; only defaults are ink (no theme remap of user colours)", () => {
  const store = createToolStylePresetStore();
  store.record("c", "line", { strokeColor: "#e03131" });
  // Excalidraw renders dark mode with a display filter; stored values never change.
  assert.equal(store.resolve("c", "line").strokeColor, "#e03131");
  assert.equal(store.resolve("c", "arrow").strokeColor, "#1e1e1e");
});

test("presets round-trip through tab snapshots and reject garbage", () => {
  const store = createToolStylePresetStore();
  store.ensureBaseRoughness("c", 1);
  store.record("c", "line", { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  const exported = store.export("c");
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), exported);

  const restored = createToolStylePresetStore();
  assert.equal(restored.hydrate("c", exported), true);
  assert.deepEqual(restored.resolve("c", "line"), store.resolve("c", "line"));

  assert.equal(sanitizeCanvasToolStyleState("nope"), null);
  assert.equal(sanitizeCanvasToolStyleState({ presets: { line: { strokeStyle: "wavy" }, laser: { strokeColor: "#fff" } } }), null);
  assert.equal(restored.hydrate("x", { presets: { line: { strokeWidth: "huge" } } }), false);

  // In-session choices win over older persisted ones.
  restored.record("c", "line", { strokeColor: "#2f9e44" });
  restored.hydrate("c", exported);
  assert.equal(restored.get("c", "line").strokeColor, "#2f9e44");
});

test("tab persistence keeps sanitized presets and drops the key when empty", () => {
  const tabs = prepareTabsForPersistence([
    { id: "a", name: "A", snapshot: { elements: [], appState: {}, toolStylePresets: { presets: { line: { strokeColor: "#e03131", strokeStyle: "wavy" }, bogus: { x: 1 } } } } },
    { id: "b", name: "B", snapshot: { elements: [], appState: {}, toolStylePresets: { presets: {} } } },
  ]);
  assert.deepEqual(tabs[0].snapshot.toolStylePresets, { presets: { line: { strokeColor: "#e03131" } } });
  assert.equal("toolStylePresets" in tabs[1].snapshot, false);
});

// -------------------------------------------- controller against a fake API

function createHarness({ activeTool = "selection", canvasId = "canvas-1" } = {}) {
  const live = {
    activeTool: { type: activeTool },
    currentItemStrokeColor: "#1e1e1e", currentItemStrokeWidth: 2, currentItemStrokeStyle: "solid",
    currentItemRoughness: 1, currentItemOpacity: 100, currentItemBackgroundColor: "transparent",
    currentItemFontFamily: 5,
  };
  const updates = [];
  const api = {
    getAppState: () => live,
    updateScene: ({ appState }) => { updates.push(appState); Object.assign(live, appState); },
  };
  const apiRef = { current: api };
  const activeCanvasIdRef = { current: canvasId };
  const controller = createToolStyleController({ apiRef, activeCanvasIdRef, captureNever: "NEVER" });
  const setTool = async (type) => {
    live.activeTool = { type };
    controller.handleSceneChange(live, { canEdit: true });
    await flushMicrotasks();
  };
  controller.handleSceneChange(live, { canEdit: true }); // first onChange of the canvas
  return { live, updates, controller, setTool, activeCanvasIdRef };
}

test("checklist replay: re-selecting Line restores red / 1px / dashed before drawing", async () => {
  const { live, controller, setTool } = createHarness();

  await setTool("line");
  // user edits the dock while Line is active (dock writes appState, then records)
  Object.assign(live, { currentItemStrokeColor: "#e03131", currentItemStrokeWidth: 1, currentItemStrokeWidthKey: "thin", currentItemStrokeStyle: "dashed" });
  controller.recordToolStyle(["line"], { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });

  await setTool("selection"); // line drawn, Excalidraw returns to selection
  await setTool("rectangle");
  Object.assign(live, { currentItemStrokeColor: "#1971c2", currentItemStrokeWidth: 4, currentItemStrokeStyle: "solid" });
  controller.recordToolStyle(["rectangle"], { strokeColor: "#1971c2", strokeWidth: 4, strokeStyle: "solid" });

  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#e03131");
  assert.equal(live.currentItemStrokeWidth, 1);
  assert.equal(live.currentItemStrokeWidthKey, "thin");
  assert.equal(live.currentItemStrokeStyle, "dashed");
  assert.equal(live.currentItemBackgroundColor, "transparent");
  assert.equal(live.currentItemEndArrowhead, null);

  await setTool("rectangle");
  assert.equal(live.currentItemStrokeColor, "#1971c2");
  assert.equal(live.currentItemStrokeWidth, 4);
});

test("selection tool and selecting a styled element never overwrite the line preset", async () => {
  const { live, controller, setTool } = createHarness();
  controller.recordToolStyle(["line"], { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  await setTool("selection");
  live.currentItemStrokeColor = "#1971c2"; // e.g. a thick blue rectangle becomes the "current" style
  live.currentItemStrokeWidth = 4;
  await setTool("selection");
  assert.deepEqual(controller.getPreset("line"), { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#e03131");
});

test("checklist: editing a selected line teaches the Line tool (green / 2px)", async () => {
  const { live, controller, setTool } = createHarness();
  controller.recordToolStyle(["line"], { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  controller.recordElementsStyle([{ type: "line" }], { strokeColor: "#2f9e44", strokeWidth: 2, x: 5 });
  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#2f9e44");
  assert.equal(live.currentItemStrokeWidth, 2);
  assert.equal(live.currentItemStrokeStyle, "dashed");
});

test("editing mixed selections updates every distinct element type, ignoring unsupported types", () => {
  const { controller } = createHarness();
  controller.recordElementsStyle([{ type: "rectangle" }, { type: "ellipse" }, { type: "image" }, { type: "text" }], { strokeColor: "#e03131", fillStyle: "hachure" });
  assert.deepEqual(controller.getPreset("rectangle"), { strokeColor: "#e03131", fillStyle: "hachure" });
  assert.deepEqual(controller.getPreset("ellipse"), { strokeColor: "#e03131", fillStyle: "hachure" });
  assert.deepEqual(controller.getPreset("text"), { strokeColor: "#e03131" });
});

test("a first-time tool gets its own defaults rather than another tool's style", async () => {
  const { live, controller, setTool } = createHarness();
  controller.recordToolStyle(["rectangle"], { strokeColor: "#1971c2", backgroundColor: "#a8c7e5", strokeWidth: 4 });
  live.currentItemStrokeColor = "#1971c2"; live.currentItemBackgroundColor = "#a8c7e5"; live.currentItemStrokeWidth = 4;
  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#1e1e1e");
  assert.equal(live.currentItemBackgroundColor, "transparent");
  assert.equal(live.currentItemStrokeWidth, 2);
});

test("canvas appearance roughness survives first activation of a tool", async () => {
  const live = { activeTool: { type: "selection" }, currentItemRoughness: 0 }; // "Clean" appearance
  const api = { getAppState: () => live, updateScene: ({ appState }) => Object.assign(live, appState) };
  const controller = createToolStyleController({ apiRef: { current: api }, activeCanvasIdRef: { current: "c" }, captureNever: "NEVER" });
  controller.handleSceneChange(live, { canEdit: true });
  live.activeTool = { type: "rectangle" };
  controller.handleSceneChange(live, { canEdit: true });
  await flushMicrotasks();
  assert.equal(live.currentItemRoughness, 0);
});

test("presets are per canvas, and a freshly mounted canvas is not 'activated'", async () => {
  const { live, controller, setTool, activeCanvasIdRef } = createHarness({ canvasId: "canvas-1" });
  controller.recordToolStyle(["line"], { strokeColor: "#e03131" });
  await setTool("line");
  await setTool("selection");

  activeCanvasIdRef.current = "canvas-2"; // tab switch remounts Excalidraw
  Object.assign(live, { currentItemStrokeColor: "#1e1e1e" });
  controller.handleSceneChange(live, { canEdit: true });
  await flushMicrotasks();
  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#1e1e1e", "canvas-2 has no line preset");

  activeCanvasIdRef.current = "canvas-1";
  controller.handleSceneChange(live, { canEdit: true });
  await setTool("selection");
  await setTool("line");
  assert.equal(live.currentItemStrokeColor, "#e03131", "canvas-1 remembered its own preset");
});

test("highlighter neither receives nor pollutes the pen preset", async () => {
  const { live, controller, setTool } = createHarness();
  controller.recordToolStyle(["freedraw"], { strokeColor: "#1971c2", strokeWidth: 4 });

  // PrimaryDock: setActiveTool(freedraw) + highlighter defaults, then announces itself.
  const detail = { tool: "highlighter" };
  const listeners = {};
  globalThis.window = { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  const detach = controller.attach();
  live.activeTool = { type: "freedraw" };
  Object.assign(live, { currentItemStrokeColor: "#ffd43b", currentItemOpacity: 40 });
  controller.handleSceneChange(live, { canEdit: true });
  listeners["sketchizi:activate-tool"]({ detail });
  await flushMicrotasks();
  assert.equal(live.currentItemStrokeColor, "#ffd43b", "highlighter colour is not overwritten");

  assert.equal(controller.recordToolStyle(["freedraw"], { strokeColor: "#ffd43b" }), false);
  assert.equal(controller.getPreset("freedraw").strokeColor, "#1971c2");

  listeners["sketchizi:clear-custom-tool"]();
  await setTool("selection");
  await setTool("freedraw");
  assert.equal(live.currentItemStrokeColor, "#1971c2", "pen preset returns after highlighter mode");
  detach();
  delete globalThis.window;
});

test("read-only sessions never apply presets", async () => {
  const { live, controller } = createHarness();
  controller.recordToolStyle(["line"], { strokeColor: "#e03131" });
  live.activeTool = { type: "line" };
  controller.handleSceneChange(live, { canEdit: false });
  await flushMicrotasks();
  assert.equal(live.currentItemStrokeColor, "#1e1e1e");
});

test("a saved text font is handed to the scene hook once so it is not reverted", async () => {
  const { live, controller, setTool } = createHarness();
  assert.equal(controller.consumeFontOverride(), null);
  controller.recordToolStyle(["text"], { fontFamily: 8, fontSize: 28 });
  assert.equal(controller.consumeFontOverride(), 8);
  assert.equal(controller.consumeFontOverride(), null);
  await setTool("text");
  assert.equal(live.currentItemFontFamily, 8);
  assert.equal(live.currentItemFontSize, 28);
  assert.equal(controller.consumeFontOverride(), 8);
});

test("explicit activation applies the preset immediately and is idempotent with the onChange restore", async () => {
  const { live, updates, controller, setTool } = createHarness();
  controller.recordToolStyle(["line"], { strokeColor: "#e03131", strokeWidth: 1, strokeStyle: "dashed" });
  assert.equal(controller.applyToolPreset("line"), true);
  assert.equal(live.currentItemStrokeColor, "#e03131");
  const afterExplicit = updates.length;
  await setTool("line"); // transition restore finds identical values and skips the write
  assert.equal(updates.length, afterExplicit);
});

test("presets can be exported per canvas, hydrated later, and forgotten", () => {
  const { controller } = createHarness();
  controller.recordToolStyle(["line"], { strokeColor: "#e03131" });
  const snapshot = controller.exportCanvas("canvas-1");
  controller.forgetCanvas("canvas-1");
  assert.equal(controller.getPreset("line", "canvas-1"), undefined);
  controller.hydrateCanvas("canvas-1", snapshot);
  assert.equal(controller.getPreset("line", "canvas-1").strokeColor, "#e03131");
});

// --------------------------------------------------------- source contracts

test("App owns the per-canvas store and routes it through tools, scene, canvas and snapshots", () => {
  const app = readAppSourceSync();
  assert.ok(app.includes("useToolStylePresets({ apiRef, activeCanvasIdRef })"));
  assert.ok(app.includes("toolStylePresets: toolStyles"));
  assert.ok(app.includes("onToolStyleChange={toolStyles.recordToolStyle}"));
  assert.ok(app.includes("toolStylePresets: toolStyles.exportCanvas(activeCanvasIdRef.current)"));
  assert.ok(app.includes("toolStyles.hydrateCanvas(tab.id, snapshot.toolStylePresets)"));
  assert.ok(app.includes("toolStyles.applyCanvasRoughness("));
  assert.ok(app.includes("toolStyles.forgetCanvas(tabId)"));
});

test("scene hook restores presets on any tool activation and adopts preset fonts", () => {
  const scene = read("../src/features/canvas/useExcalidrawScene.js");
  assert.ok(scene.includes("toolStylePresets?.handleSceneChange?.(appState, { canEdit })"));
  assert.ok(scene.includes("toolStylePresets?.consumeFontOverride?.()"));
  const tools = read("../src/features/canvas/useCanvasTools.js");
  assert.ok(tools.includes("toolStylePresets?.applyToolPreset?.(toolType)"));
  assert.ok(tools.includes("activateDrawingTool"));
});

test("both docks record edits; restores use the shared appState mapping", () => {
  const dock = read("../src/components/app/ToolOptionsDock.jsx");
  const toolbar = read("../src/components/app/ContextualFormattingToolbar.jsx");
  for (const source of [dock, toolbar]) {
    assert.ok(source.includes("onToolStyleChange"));
    assert.ok(source.includes("normalizeToolKey"));
  }
  // Restores go through the shared mapping; the dock converts roundness to appState form.
  assert.ok(read("../src/features/canvas/toolStyleController.js").includes("stylePatchToAppState"));
  assert.ok(dock.includes('appStatePatch.currentItemRoundness = value ? "round" : "sharp"'));
  assert.ok(dock.includes("const rememberStyle ="));
  assert.ok(dock.includes('activeRoundness = isSelection ? Boolean(first?.roundness) : appState.currentItemRoundness === "round"'));
  assert.ok(toolbar.includes("!noteSelection"));
});

test("theme and appearance code never rewrites remembered colours", () => {
  const controller = read("../src/features/canvas/toolStyleController.js");
  const presets = read("../src/features/canvas/toolStylePresets.js");
  assert.ok(!/theme/i.test(controller.replace(/Excalidraw/g, "")));
  assert.ok(!/theme|f8fafc/i.test(presets.replace(/\/\*[\s\S]*?\*\//g, "")));
});

// ------------------------------------------------- default + remembered arrow

test("fresh canvases default arrows to solid Straight, no start head, arrow end head", () => {
  const store = createToolStylePresetStore();
  const preset = store.resolve("canvas-1", "arrow");
  assert.equal(preset.lineGeometry, "straight");
  assert.equal(preset.elbowed, false);
  assert.equal(preset.roundness, null);
  assert.equal(preset.strokeStyle, "solid");
  assert.equal(preset.startArrowhead, null);
  assert.equal(preset.endArrowhead, "arrow");
  const appState = stylePatchToAppState(preset);
  assert.equal(appState.currentItemArrowType, "sharp");
  assert.equal(appState.currentItemRoundness, "sharp");
  assert.equal(appState.currentItemStrokeStyle, "solid");
  assert.equal(appState.currentItemStartArrowhead, null);
  assert.equal(appState.currentItemEndArrowhead, "arrow");
});

test("routing fields stay consistent whichever one a patch carries", () => {
  assert.deepEqual(filterStyleForTool("arrow", { lineGeometry: "rounded-elbow" }), { lineGeometry: "rounded-elbow", roundness: { type: 2 }, elbowed: false });
  assert.deepEqual(filterStyleForTool("arrow", { lineGeometry: "curved" }), { lineGeometry: "curved", roundness: { type: 2 }, elbowed: false });
  assert.deepEqual(filterStyleForTool("arrow", { elbowed: true }), { lineGeometry: "elbow", roundness: null, elbowed: true });
  assert.deepEqual(filterStyleForTool("arrow", { elbowed: false, roundness: null }), { lineGeometry: "straight", roundness: null, elbowed: false });
  assert.ok(!("elbowed" in filterStyleForTool("line", { lineGeometry: "curved" })), "only arrows are elbowed");
  assert.equal(stylePatchToAppState({ lineGeometry: "rounded-elbow" }).currentItemArrowType, "sharp");
  assert.equal(stylePatchToAppState({ lineGeometry: "curved" }).currentItemArrowType, "round");
});

test("dot arrowheads are stored as the renderable circle value", () => {
  assert.deepEqual(filterStyleForTool("arrow", { endArrowhead: "dot" }), { endArrowhead: "circle" });
  assert.equal(stylePatchToAppState({ startArrowhead: "dot" }).currentItemStartArrowhead, "circle");
});

test("every arrow customization carries to the next arrow on the same canvas only", async () => {
  const appStates = [];
  const api = {
    getAppState: () => ({}),
    updateScene: ({ appState }) => appStates.push(appState),
  };
  const controller = createToolStyleController({ apiRef: { current: api }, activeCanvasIdRef: { current: "canvas-1" }, captureNever: 0 });
  controller.recordToolStyle(["arrow"], { strokeColor: "#e03131" });
  controller.recordToolStyle(["arrow"], { strokeStyle: "dashed", strokeWidth: 4 });
  controller.recordToolStyle(["arrow"], { lineGeometry: "rounded-elbow" });
  controller.recordToolStyle(["arrow"], { endArrowhead: "dot" });
  // Arrow edits reach currentItem* immediately, without a tool switch.
  const last = appStates.at(-1);
  assert.equal(last.currentItemStrokeColor, "#e03131");
  assert.equal(last.currentItemStrokeStyle, "dashed");
  assert.equal(last.currentItemArrowType, "sharp");
  assert.equal(last.currentItemEndArrowhead, "circle");

  appStates.length = 0;
  assert.equal(controller.applyToolPreset("arrow"), true);
  assert.deepEqual(
    { c: appStates[0].currentItemStrokeColor, s: appStates[0].currentItemStrokeStyle, g: appStates[0].currentItemLineGeometry, e: appStates[0].currentItemEndArrowhead },
    { c: "#e03131", s: "dashed", g: "rounded-elbow", e: "circle" },
  );
  // A different canvas still gets the defaults.
  const other = createToolStylePresetStore();
  assert.equal(other.resolve("canvas-2", "arrow").lineGeometry, "straight");
});

test("switching an arrow to Elbow is remembered over the Straight default", () => {
  const store = createToolStylePresetStore();
  store.record("canvas-1", "arrow", { lineGeometry: "elbow" });
  assert.equal(store.resolve("canvas-1", "arrow").elbowed, true);
  assert.equal(stylePatchToAppState(store.resolve("canvas-1", "arrow")).currentItemArrowType, "elbow");
  assert.equal(store.resolve("canvas-2", "arrow").lineGeometry, "straight");
});
