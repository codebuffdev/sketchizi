import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('empty editable canvas offers a dismissible getting-started hint', () => {
  assert.match(canvas, /isCanvasEmpty/);
  assert.match(canvas, /!viewModeEnabled && isCanvasEmpty && !discoveryHintDismissed/);
  assert.match(canvas, /aria-label="Getting started"/);
  assert.match(canvas, /setDiscoveryHintDismissed\(true\)/);
});

test('getting-started hint exposes shortcut discovery and keyboard focus', () => {
  assert.match(canvas, /Press <kbd>\?<\/kbd> for keyboard shortcuts/);
  assert.match(canvas, /aria-label="Dismiss getting started hint"/);
  assert.match(dockCss, /\.sketchizi-discovery-hint > button:focus-visible/);
});

test('discovery hint is responsive and supports dark theme', () => {
  assert.match(dockCss, /\.app\.theme-dark \.sketchizi-discovery-hint/);
  assert.match(dockCss, /@media \(max-width: 700px\)[\s\S]*\.sketchizi-discovery-hint/);
});
