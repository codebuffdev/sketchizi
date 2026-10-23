import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/ui-modernization-navigation.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('adds Fit to content to the existing native zoom controls', () => {
  assert.match(canvas, /root\.querySelector\("\.zoom-actions"\)/);
  assert.match(canvas, /sketchizi-fit-content-button/);
  assert.match(canvas, /aria-label", "Fit diagram to viewport"/);
  assert.match(canvas, /Fit to content \(F\)/);
  assert.match(canvas, /zoomActions\.querySelector\("\:scope > \.Stack_horizontal"\)/);
  assert.match(canvas, /zoomRow\.appendChild\(fitButton\)/);
});

test('fit action delegates to native viewport APIs and ignores deleted elements', () => {
  assert.match(canvas, /getSceneElements\?\.\(\) \|\| \[\]\)\.filter\(\(element\) => element && !element\.isDeleted && !element\.deleted\)/);
  assert.match(canvas, /api\.setViewport\(\{ target: elements, fit: "contain" \}\)/);
  assert.match(canvas, /api\.scrollToContent\?\.\(elements, \{ fitToViewport: true, animate: true \}\)/);
});

test('fit control is disabled when editing is unavailable or the canvas is empty', () => {
  assert.match(canvas, /fitButton\.disabled = !canEdit \|\| viewModeEnabled \|\| visibleElements\.length === 0/);
  assert.match(canvas, /fitContentButtonRef\.current\.disabled = !canEdit \|\| viewModeEnabled \|\| !hasVisibleElements/);
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
