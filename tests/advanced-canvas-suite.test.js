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
const templatesModalSource = readFileSync(new URL("../src/components/app/ArchitectureTemplatesModal.jsx", import.meta.url), "utf8");
const packInsertionSource = readFileSync(new URL("../src/features/templates/architecturePackInsertion.js", import.meta.url), "utf8");
const advancedCss = readFileSync(new URL("../src/styles/advanced-canvas-suite.css", import.meta.url), "utf8");
const mapDockCss = readFileSync(new URL("../src/styles/map-dock.css", import.meta.url), "utf8");

test("Capability 1: Canvas Mini-Map Navigator is integrated with header toggle and dark mode styles", () => {
  assert.ok(appHeader.includes("onToggleMinimap"), "Header accepts onToggleMinimap prop");
  assert.ok(appHeader.includes("view.toggle-minimap"), "View menu exposes the mini-map action");
  assert.ok(appHeader.includes("minimapOpen"), "Header tracks minimap active state");

  assert.match(appSource, /const \[minimapOpen, setMinimapOpen\] = useState\(false\);/);
  assert.match(appSource, /onToggleMinimap=\{\(\) => setMinimapOpen\(\(o\) => !o\)\}/);

  assert.ok(mapDockCss.includes(".app.theme-dark {"), "Map defines Dark Mode variables");
  assert.ok(mapDockCss.includes(".app.theme-light {"), "Map defines Day Mode variables");
  assert.ok(mapDockCss.includes("rgba(24, 27, 32, 0.88)"), "Dark popover surface");
  assert.ok(mapDockCss.includes("rgba(255, 255, 255, 0.92)"), "Day popover surface");
});

test("Capability 2: Export Studio is available in document dropdown while native image export and find stay disabled", () => {
  const nativeMenu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  const commands = readFileSync(new URL("../src/features/commands/commandRegistry.js", import.meta.url), "utf8");
  const stackExport = readFileSync(new URL("../src/features/system-design/ExportStackModal.jsx", import.meta.url), "utf8");
  assert.ok(appHeader.includes("<h3>Download &amp; export</h3>"));
  assert.ok(appHeader.includes("Export studio..."));
  assert.ok(appHeader.includes("Choose PNG, SVG, clipboard and export settings"));
  assert.match(appSource, /ExportStudioModal/);
  assert.match(appSource, /exportStudioOpen/);
  assert.match(appSource, /systemDesignWorkspace = systemDesign/);
  assert.match(nativeMenu, /blockedMenuLabels = new Set/);
  assert.match(nativeMenu, /key === "f"/);
  assert.doesNotMatch(commands, /export\.image|export\.studio|export\.diagram-yaml-png/);
  assert.match(stackExport, /compileStack\(nodes, edges, target\)/);
  assert.match(stackExport, /Download/);
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

  // Placement logic is shared with the command palette via architecturePackInsertion.js.
  assert.ok(templatesModalSource.includes("insertArchitecturePack("), "Modal delegates to the shared insertion service");
  assert.ok(packInsertionSource.includes("offsetX = maxX + 80"), "Computes non-overlapping insertion offset");
  assert.ok(packInsertionSource.includes("api.updateScene"), "Inserts template into canvas scene");
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
