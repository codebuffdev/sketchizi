import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const commands = readFileSync(new URL('../src/features/commands/commandRegistry.js', import.meta.url), 'utf8');
const preferences = readFileSync(new URL('../src/features/navigation/useSketchiziPreferences.js', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/app/DesktopAppHeader.jsx', import.meta.url), 'utf8');
const shortcuts = readFileSync(new URL('../src/ShortcutHelp.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/ui-modernization-grid.css', import.meta.url), 'utf8');
const styleEntry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const snap = readFileSync(new URL('../src/features/canvas/gridSnap.js', import.meta.url), 'utf8');

test('canvas grid visibility has its own state, separate from grid snapping state', () => {
  assert.match(app, /const \[gridEnabled, setGridEnabled\] = useState\(false\)/);
  assert.match(app, /const \[gridVisible, setGridVisible\] = useState\(false\)/);
  assert.match(app, /const toggleCanvasGrid = useCallback\(\(\) => setGridVisible\(\(visible\) => !visible\), \[\]\)/);
  assert.match(app, /gridVisible=\{gridVisible\}/);
  assert.match(canvas, /data-grid-visible=\{gridVisible \? "true" : "false"\}/);
  assert.match(canvas, /gridModeEnabled=\{false\}/);
  assert.match(canvas, /snapChangedSceneElements\(currentElements, baseline, gridSize\)/);
  assert.match(app, /gridSnappingEnabled=\{gridEnabled\}/);
});

test('View menu exposes separate canvas-grid and grid-snapping commands', () => {
  assert.match(commands, /id: "view\.toggle-canvas-grid"[\s\S]*?shortcut: "G"[\s\S]*?execute: toggleCanvasGrid/);
  assert.match(commands, /id: "view\.toggle-grid"[\s\S]*?label: gridEnabled \? "Disable Grid Snapping" : "Enable Grid Snapping"[\s\S]*?shortcut: "⇧G"[\s\S]*?execute: toggleGrid/);
  assert.match(header, /"view\.toggle-canvas-grid"[\s\S]*?"view\.toggle-grid"/);
});

test('G and Shift+G shortcuts are documented and independently routed', () => {
  assert.match(preferences, /if \(event\.shiftKey && key === "g"\).*?toggleGrid\(\)/);
  assert.match(preferences, /if \(!event\.shiftKey && key === "g"\).*?toggleCanvasGrid\?\.\(\)/);
  assert.match(shortcuts, /\["G", "Show \/ hide canvas grid"\]/);
  assert.match(shortcuts, /\["⇧ G", "Toggle grid snapping"\]/);
});

test('visual grid scales and repositions with canvas zoom and scroll', () => {
  assert.match(canvas, /gridStepPixels = Math\.max\(5, Number\(gridSize\) \|\| 20\) \* gridZoom/);
  assert.match(canvas, /gridAppState\.scrollX/);
  assert.match(canvas, /gridAppState\.scrollY/);
  assert.match(styles, /background-size: var\(--sketchizi-grid-step/);
  assert.match(styles, /background-position: var\(--sketchizi-grid-origin-x/);
});

test('grid overlay does not capture canvas interactions and respects theme', () => {
  assert.match(styles, /pointer-events: none/);
  assert.match(styles, /\.app\.theme-light/);
  assert.match(styles, /\.app\.theme-dark/);
  assert.match(styleEntry, /@import "\.\/styles\/ui-modernization-grid\.css";/);
  assert.ok(styleEntry.indexOf('ui-modernization-grid.css') > styleEntry.indexOf('ui-modernization-navigation.css'));
  assert.ok(styleEntry.indexOf('ui-modernization-grid.css') < styleEntry.indexOf('.kubernetes-library-status'));
});
