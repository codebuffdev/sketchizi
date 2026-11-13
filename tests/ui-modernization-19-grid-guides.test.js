import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.jsx');
const canvas = read('../src/components/app/SketchiziCanvas.jsx');
const tools = read('../src/features/canvas/useCanvasTools.js');
const commands = read('../src/features/commands/commandRegistry.js');
const preferences = read('../src/features/navigation/useSketchiziPreferences.js');
const header = read('../src/components/app/DesktopAppHeader.jsx');
const shortcuts = read('../src/ShortcutHelp.jsx');
const panelState = read('../src/features/navigation/usePanelState.js');
const styles = read('../src/styles.css');

test('Excalidraw owns grid display and snapping', () => {
  assert.match(app, /const \[gridEnabled, setGridEnabled\] = useState\(false\)/);
  assert.match(app, /gridEnabled=\{gridEnabled\}/);
  assert.match(canvas, /gridModeEnabled=\{gridEnabled\}/);
  assert.match(canvas, /gridModeEnabled: gridEnabled/);
  assert.match(tools, /gridModeEnabled: enabled/);
  assert.doesNotMatch(canvas, /sketchizi-grid-overlay|gridSnapBaselineRef|snapChangedSceneElements|gridVisible|gridSnappingEnabled/);
  assert.doesNotMatch(styles, /ui-modernization-grid\.css/);
});

test('View menu exposes a single native grid command', () => {
  assert.match(commands, /id: "view\.toggle-grid"[\s\S]*?shortcut: "G"[\s\S]*?execute: toggleGrid/);
  assert.match(commands, /label: gridEnabled \? "Hide Grid" : "Show Grid"/);
  assert.doesNotMatch(commands, /view\.toggle-canvas-grid|gridVisible|toggleCanvasGrid/);
  assert.match(header, /"view\.toggle-grid"/);
  assert.doesNotMatch(header, /view\.toggle-canvas-grid/);
});

test('G toggles the native grid without a separate Shift+G mode', () => {
  assert.match(preferences, /if \(!event\.shiftKey && key === "g"\) \{ event\.preventDefault\(\); toggleGrid\(\); return; \}/);
  assert.doesNotMatch(preferences, /toggleCanvasGrid|event\.shiftKey && key === "g"/);
  assert.match(shortcuts, /\["G", "Toggle Excalidraw grid"\]/);
  assert.doesNotMatch(shortcuts, /Toggle grid snapping|⇧ G/);
});

test('Layers panel entry points and automatic opening are removed', () => {
  assert.doesNotMatch(app, /LayersPanel|layersOpen|autoOpenLayers|knownLayerElementIdsRef|auto-open-layers/);
  assert.doesNotMatch(commands, /layers\.open|openPanel\("layers"\)/);
  assert.doesNotMatch(panelState, /layersOpen|activePanel === "layers"/);
  assert.match(app, /<ArchitectureValidationPanel/);
  assert.match(app, /<SketchiziCanvas/);
});
