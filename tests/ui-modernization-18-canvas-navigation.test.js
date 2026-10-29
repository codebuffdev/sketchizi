import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/ui-modernization-navigation.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('does not add a duplicate fit-to-content control beside native zoom controls', () => {
  assert.doesNotMatch(canvas, /sketchizi-fit-content-button/);
  assert.doesNotMatch(canvas, /zoomRow\.appendChild\(fitButton\)/);
});

test('removes Excalidraw Scroll back to content navigation control', () => {
  assert.match(canvas, /scroll back to content/i);
  assert.match(canvas, /if \(\/scroll back to content\/i\.test\(label\)\) button\.remove\(\)/);
});

test('native zoom and undo/redo controls retain accessible titles and disabled styling', () => {
  assert.match(styles, /\.undo-button:disabled/);
  assert.match(styles, /\.redo-button:disabled/);
  assert.match(canvas, /Undo \(Ctrl\/Cmd\+Z\)/);
  assert.match(canvas, /Redo \(Ctrl\+Y \/ Cmd\+Shift\+Z\)/);
});

test('navigation styles load after existing Sketchizi UI layers', () => {
  assert.match(entry, /@import "\.\/styles\/ui-modernization-navigation\.css";/);
  assert.ok(entry.indexOf('ui-modernization-navigation.css') > entry.indexOf('ui-modernization-toolbar-dock.css'));
});


test('native hamburger menu and floating catalogs are mutually exclusive', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /nativeMenuOpenRef\.current = false;[\s\S]*?setNativeMenuOpen\(false\);[\s\S]*?api\.updateScene\(\{ appState: \{ openMenu: null \}/);
  assert.match(app, /if \(nativeMenuOpen && activePanel\) setActivePanel\(null\)/);
  assert.match(app, /usePanelState\(\{ apiRef, closeNativeMenu \}\)/);
});
