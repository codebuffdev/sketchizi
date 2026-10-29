import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/ui-modernization-navigation.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('keeps Fit to content beside the native zoom controls', () => {
  assert.match(canvas, /sketchizi-fit-content-button/);
  assert.match(canvas, /aria-label", "Fit diagram to viewport"/);
  assert.match(canvas, /Fit to content \\(F\\)/);
  assert.match(canvas, /zoomActions\.querySelector\(":scope > \.Stack_horizontal"\)/);
  assert.match(canvas, /zoomRow\.appendChild\(fitButton\)/);
});

test('fit action delegates to native viewport APIs and ignores deleted elements', () => {
  assert.match(canvas, /getSceneElements\?\.\(\) \|\| \[\]\)\.filter\(\(element\) => element && !element\.isDeleted && !element\.deleted\)/);
  assert.match(canvas, /api\.setViewport\(\{ target: elements, fit: "contain" \}\)/);
  assert.match(canvas, /api\.scrollToContent\?\.\(elements, \{ fitToViewport: true, animate: true \}\)/);
});

test('removes Excalidraw Scroll back to content control while keeping Fit to content', () => {
  assert.match(canvas, /scroll back to content/i);
  assert.match(canvas, /if \(\/scroll back to content\/i\.test\(label\)\) button\.remove\(\)/);
  assert.match(canvas, /fitContentButtonRef\.current\.disabled = !canEdit \|\| viewModeEnabled \|\| !hasVisibleElements/);
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
