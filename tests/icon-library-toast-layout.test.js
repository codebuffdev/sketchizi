import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/IconLibraryPanel.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/icon-panel-v2.css', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('../src/styles/canvas-feedback-overlays.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('library categories have readable full names and preserve source selection', () => {
  assert.match(panel, /sk-library-section-label/);
  assert.match(panel, /Browse collections/);
  assert.match(panel, /\{tab\.label\}/);
  assert.match(panel, /onClick=\{\(\) => chooseSource\(isActive \? "all" : tab\.id\)\}/);
  assert.match(styles, /\.sk-catalog-tabs\s*\{[^}]*display: grid !important;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/s);
});

test('library retains insert, drag, saved, recent and both view-mode controls', () => {
  assert.match(panel, /setViewMode\("grid"\)/);
  assert.match(panel, /setViewMode\("list"\)/);
  assert.match(panel, /chooseSource\("favorites"\)/);
  assert.match(panel, /chooseSource\("recent"\)/);
  assert.match(panel, /handleIconClick\(icon\)/);
  assert.match(panel, /handleDragStart\(event, icon\)/);
  assert.match(panel, /toggleFavorite\(icon\)/);
  assert.match(panel, /sk-icon-results-summary/);
  assert.match(panel, /sk-icon-panel-hint/);
});

test('toast is fixed below the header instead of overlapping the bottom toolbar', () => {
  assert.match(entry, /import "\.\/styles\/canvas-feedback-overlays\.css"/);
  assert.match(feedback, /\.excalidraw \.Toast\s*\{[^}]*position: fixed !important;[^}]*top: calc\([^}]*\) !important;[^}]*bottom: auto !important;/s);
  assert.match(feedback, /\.Toast__message/);
  assert.match(feedback, /max-width: min\(440px, calc\(100vw - 32px\)\)/);
});

test('narrow viewports keep category labels and icon thumbnails usable', () => {
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(feedback, /@media \(max-width: 760px\)/);
});
