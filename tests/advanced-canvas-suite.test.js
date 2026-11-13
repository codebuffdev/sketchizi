import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARCHITECTURE_PACKS } from "../src/features/templates/architecturePacks.js";
import { SMART_THEMES, applySmartThemeToElements } from "../src/features/canvas/smartThemePalettes.js";
import { handleStickyNoteRapidFlow } from "../src/features/canvas/stickyNoteFlow.js";

const appHeader = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
const exportModalSource = readFileSync(new URL("../src/components/app/ExportStudioModal.jsx", import.meta.url), "utf8");
const templatesModalSource = readFileSync(new URL("../src/components/app/ArchitectureTemplatesModal.jsx", import.meta.url), "utf8");
const advancedCss = readFileSync(new URL("../src/styles/advanced-canvas-suite.css", import.meta.url), "utf8");

test("Capability 1: Canvas Mini-Map Navigator is integrated with header toggle and dark mode styles", () => {
  assert.ok(appHeader.includes("onToggleMinimap"), "Header accepts onToggleMinimap prop");
  assert.ok(appHeader.includes("view.toggle-minimap"), "View menu exposes the mini-map action");
  assert.ok(appHeader.includes("minimapOpen"), "Header tracks minimap active state");

  assert.match(appSource, /const \[minimapOpen, setMinimapOpen\] = useState\(false\);/);
  assert.match(appSource, /onToggleMinimap=\{\(\) => setMinimapOpen\(\(o\) => !o\)\}/);

  assert.ok(advancedCss.includes(".app.theme-dark .minimap"), "Has dark theme minimap styling");
  assert.ok(advancedCss.includes(".app.theme-dark .minimap-camera"), "Has dark theme camera indicator");
  assert.ok(advancedCss.includes(".app.theme-dark .minimap-viewport"), "Has dark theme viewport background");
});

test("Capability 2: High-Res Export Studio offers 1x/2x/3x scale, background modes, and 1-click clipboard", () => {
  assert.ok(appHeader.includes("onOpenExport"), "Header accepts onOpenExport prop");
  assert.ok(appHeader.includes("onOpenExport?.()") && appHeader.includes("Export studio…"), "Save menu opens Export Studio");
  assert.ok(appSource.includes("<ExportStudioModal"), "App mounts ExportStudioModal");

  assert.ok(exportModalSource.includes("Resolution Scale"), "Modal provides resolution scale controls");
  assert.ok(exportModalSource.includes("[1, 2, 3]"), "Supports 1x, 2x, 3x multipliers");
  assert.ok(exportModalSource.includes("Dark Surface") && exportModalSource.includes("Transparent"), "Supports dark, light, transparent backgrounds");
  assert.ok(exportModalSource.includes("Copy Image to Clipboard"), "Has 1-click clipboard button");
  assert.ok(exportModalSource.includes("navigator.clipboard?.write"), "Uses native clipboard write API");
  assert.ok(exportModalSource.includes("Download PNG") && exportModalSource.includes("Download SVG"), "Provides download buttons");
});

test("Capability 3: Architecture Starter Packs contain production cloud and interview templates", () => {
  assert.ok(appHeader.includes("onOpenTemplates"), "Header accepts onOpenTemplates prop");
  assert.ok(appSource.includes("<ArchitectureTemplatesModal"), "App mounts ArchitectureTemplatesModal");

  assert.ok(ARCHITECTURE_PACKS.length >= 4, "Provides at least 4 architecture templates");
  const ids = ARCHITECTURE_PACKS.map(p => p.id);
  assert.ok(ids.includes("aws-3tier"), "Includes AWS 3-tier pack");
  assert.ok(ids.includes("event-driven"), "Includes Kafka event-driven pack");
  assert.ok(ids.includes("k8s-cluster"), "Includes Kubernetes cluster pack");
  assert.ok(ids.includes("interview-framework"), "Includes System Design interview pack");

  assert.ok(templatesModalSource.includes("offsetX = maxX + 80"), "Computes non-overlapping insertion offset");
  assert.ok(templatesModalSource.includes("api.updateScene"), "Inserts template into canvas scene");
});

test("Capability 4: Smart Theme Palettes provide 1-click aesthetic beautifier", () => {
  assert.ok(SMART_THEMES.length >= 5, "Has at least 5 curated themes");
  const themeIds = SMART_THEMES.map(t => t.id);
  assert.ok(themeIds.includes("cloud-native"));
  assert.ok(themeIds.includes("cyberpunk"));
  assert.ok(themeIds.includes("pastel-boardroom"));
  assert.ok(themeIds.includes("minimalist-monokai"));
  assert.ok(themeIds.includes("architectural-blueprint"));

  const mockElements = [
    { id: "1", type: "rectangle", strokeColor: "#000", backgroundColor: "#fff" },
    { id: "2", type: "arrow", strokeColor: "#000" },
    { id: "3", type: "text", strokeColor: "#000" },
  ];
  const transformed = applySmartThemeToElements(mockElements, "cloud-native");
  assert.equal(transformed[0].strokeColor, "#3b82f6");
  assert.equal(transformed[0].backgroundColor, "#dbeafe");
  assert.equal(transformed[1].strokeColor, "#60a5fa");
  assert.equal(transformed[2].strokeColor, "#1e40af");

  assert.ok(toolbarSource.includes("Smart Themes"), "Toolbar exposes Smart Themes group");
  assert.ok(toolbarSource.includes("applySmartThemeToElements"), "Toolbar applies smart themes to scene elements");
});

test("Capability 5: Sticky Note Rapid Flow auto-spawns notes on Tab and Enter", () => {
  assert.ok(canvasSource.includes("handleStickyNoteRapidFlow"), "SketchiziCanvas hooks sticky note rapid flow");

  let updatedScene = null;
  const mockApi = {
    getAppState: () => ({ selectedElementIds: { "note-1": true } }),
    getSceneElements: () => [
      { id: "note-1", type: "rectangle", x: 100, y: 100, width: 160, height: 160, backgroundColor: "#fff000" }
    ],
    updateScene: (params) => { updatedScene = params; }
  };

  const tabEvent = {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: { tagName: "CANVAS" }
  };

  const handledTab = handleStickyNoteRapidFlow(tabEvent, mockApi);
  assert.equal(handledTab, true, "Tab event handled");
  assert.ok(updatedScene, "Scene was updated");
  assert.equal(updatedScene.elements.length, 2, "New note appended");
  const newNote = updatedScene.elements[1];
  assert.equal(newNote.x, 100 + 160 + 24, "Placed to the right with 24px gap");
  assert.equal(newNote.y, 100, "Same vertical alignment");

  const enterEvent = {
    key: "Enter",
    shiftKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: { tagName: "CANVAS" }
  };
  const handledEnter = handleStickyNoteRapidFlow(enterEvent, mockApi);
  assert.equal(handledEnter, true, "Enter event handled");
  const noteBelow = updatedScene.elements[1];
  assert.equal(noteBelow.y, 100 + 160 + 24, "Placed below with 24px gap");
});
