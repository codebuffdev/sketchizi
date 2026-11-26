import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/ui-modernization-navigation.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const mapRadar = readFileSync(new URL('../src/features/canvas/mapRadar.js', import.meta.url), 'utf8');
const mapRadarView = readFileSync(new URL('../src/components/app/CanvasMapRadar.jsx', import.meta.url), 'utf8');
const preferences = readFileSync(new URL('../src/features/navigation/useSketchiziPreferences.js', import.meta.url), 'utf8');
const shortcutHelp = readFileSync(new URL('../src/ShortcutHelp.jsx', import.meta.url), 'utf8');

test('Fit to content is offered from the Map header and the F shortcut', () => {
  assert.match(mapRadarView, /className="sk-map-fit"/);
  assert.match(mapRadarView, /Center and fit all content/);
  assert.match(shortcutHelp, /\["F", "Fit diagram to viewport"\]/);
  assert.match(preferences, /if \(key === "f"\) \{ event\.preventDefault\(\); fitDiagram\(\); \}/);
});

test('fit action delegates to native viewport APIs and ignores deleted elements', () => {
  for (const source of [mapRadar, preferences]) {
    assert.match(source, /getSceneElements\(\)\.filter\(\(element\) => !element\.isDeleted\)/);
    assert.match(source, /api\.setViewport\(\{ target: elements, fit: "contain" \}\)/);
    assert.match(source, /api\.scrollToContent\?\.\(elements, \{ fitToViewport: true, animate: true \}\)/);
  }
});

test('fit shortcut is a no-op on an empty canvas and while typing', () => {
  assert.match(preferences, /if \(!elements\.length\) return;/);
  assert.match(preferences, /const isTyping = target instanceof HTMLInputElement \|\| target instanceof HTMLTextAreaElement \|\| target\?\.isContentEditable;/);
  assert.match(preferences, /if \(isTyping\) return;/);
});

test('navigation controls provide focus, disabled states, and accessible hover feedback', () => {
  assert.match(styles, /\.sketchizi-fit-content-button:hover:not\(:disabled\)/);
  assert.match(styles, /\.sketchizi-fit-content-button:focus-visible/);
  assert.match(styles, /\.undo-button:disabled/);
  assert.match(styles, /\.redo-button:disabled/);
  assert.match(canvas, /Undo \(Ctrl\/Cmd\+Z\)/);
  assert.match(canvas, /Redo \(Ctrl\+Y \/ Cmd\+Shift\+Z\)/);
});

test('navigation styles load after existing Sketchizi UI layers', () => {
  assert.match(entry, /@import "\.\/styles\/ui-modernization-navigation\.css";/);
  assert.ok(entry.indexOf('ui-modernization-navigation.css') > entry.indexOf('ui-modernization-toolbar-dock.css'));
});


test('hamburger menu and icon library share the left edge without touching the right edge', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /nativeMenuOpenRef\.current = false;[\s\S]*?setNativeMenuOpen\(false\);[\s\S]*?api\.updateScene\(\{ appState: \{ openMenu: null \}/);
  assert.match(app, /usePanelState\(\{ apiRef, nativeMenuOpen, closeNativeMenu \}\)/);
  assert.doesNotMatch(app, /setActivePanel/);
  const panelState = readFileSync(new URL('../src/features/navigation/usePanelState.js', import.meta.url), 'utf8');
  assert.match(panelState, /activeLeftPanel/);
  assert.match(panelState, /activeRightPanel/);
  assert.match(panelState, /isRightRailPinned/);
  assert.doesNotMatch(panelState, /setAiAskOpen\?\.\(false\)/);
});
