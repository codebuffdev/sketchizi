import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('contextual toolbar is rendered only for editable selections', () => {
  assert.match(toolbar, /if \(!canEdit \|\| liveSelection\.length === 0 \|\| !position\) return null/);
  assert.match(canvas, /<ContextualFormattingToolbar[\s\S]*?selectedElements=\{selectedElements\}/);
  assert.match(canvas, /canEdit=\{canEdit && !viewModeEnabled\}/);
});

test('contextual formatting exposes selection mode and uses model-driven controls', () => {
  assert.match(toolbar, /getContextualDockModel\(liveSelection, \{ canEdit \}\)/);
  assert.match(toolbar, /data-contextual-mode=\{dockModel\.mode\}/);
  assert.match(toolbar, /data-selected-count=\{dockModel\.selectedCount\}/);
  assert.match(toolbar, /data-preserve-image-artwork=\{dockModel\.preserveImageArtwork \? "true" : "false"\}/);
  assert.match(toolbar, /const showTextSize = dockModel\.showTextControls/);
  assert.match(toolbar, /dockModel\.showShapeControls/);
});

test('contextual controls use existing selection update and properties-panel callbacks', () => {
  assert.match(toolbar, /applyToSelected\(\{ strokeColor: color \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ backgroundColor: color \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ strokeWidth: width \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ fontSize:/);
  assert.match(toolbar, /onClick=\{onOpenProperties\}/);
  assert.match(app, /applyToSelected=\{applyToSelected\}/);
  assert.match(app, /onOpenProperties=\{\(\) => openPanel\("properties"\)\}/);
});

test('selection toolbar placement accounts for zoom, scroll, and canvas bounds', () => {
  assert.match(toolbar, /appState\.zoom\?\.value/);
  assert.match(toolbar, /appState\.scrollX/);
  assert.match(toolbar, /appState\.scrollY/);
  assert.match(toolbar, /Math\.min\(rootHeight - 54/);
  assert.match(toolbar, /canvasRevision/);
  assert.match(toolbar, /const belowTop = bottomY \+ 12/);
});

test('contextual toolbar has light, dark, responsive, and focus-visible styling', () => {
  assert.match(styles, /\.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-dark \.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-light \.contextual-formatting-toolbar/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?contextual-formatting-toolbar/);
  assert.match(styles, /:focus-visible/);
});


test('Library icon images remain untouched by shape formatting until safe recoloring is supported', () => {
  const canvasTools = readFileSync(new URL('../src/features/canvas/useCanvasTools.js', import.meta.url), 'utf8');
  assert.match(canvasTools, /Keep library image assets untouched/);
  assert.match(canvasTools, /if \(element\.type === "image" && \(element\.customData\?\.iconId \|\| element\.customData\?\.diagramIcon\)\) return element/);
  assert.doesNotMatch(canvasTools, /recolorSvgDataUrl/);
  assert.doesNotMatch(toolbar, /recolorableIconSelection/);
});
