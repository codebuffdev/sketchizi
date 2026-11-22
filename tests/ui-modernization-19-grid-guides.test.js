import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.jsx');
const commands = read('../src/features/commands/commandRegistry.js');
const preferences = read('../src/features/navigation/useSketchiziPreferences.js');
const shortcuts = read('../src/ShortcutHelp.jsx');
const panelState = read('../src/features/navigation/usePanelState.js');

test('the command palette exposes the canvas pattern toggle', () => {
  assert.match(commands, /id: "view\.toggle-grid"[\s\S]*?shortcut: "G"[\s\S]*?execute: toggleGrid/);
  assert.match(commands, /label: gridEnabled \? "Hide Grid" : "Show Grid"/);
});

test('G is the canvas pattern shortcut without a separate Shift+G binding', () => {
  assert.match(preferences, /if \(!event\.shiftKey && key === "g"\) \{ event\.preventDefault\(\); toggleGrid\(\); return; \}/);
  assert.doesNotMatch(preferences, /toggleCanvasGrid|if \(event\.shiftKey && key === "g"/);
  assert.match(shortcuts, /\["G", "Toggle canvas pattern"\]/);
  assert.doesNotMatch(shortcuts, /Toggle grid snapping|⇧ G/);
});

test('Layers panel entry points and automatic opening are removed', () => {
  assert.doesNotMatch(app, /LayersPanel|layersOpen|autoOpenLayers|knownLayerElementIdsRef|auto-open-layers/);
  assert.doesNotMatch(commands, /layers\.open|openPanel\("layers"\)/);
  assert.doesNotMatch(panelState, /layersOpen|activePanel === "layers"/);
  assert.doesNotMatch(app, /ArchitectureValidationPanel/);
  assert.match(app, /<SketchiziCanvas/);
});
