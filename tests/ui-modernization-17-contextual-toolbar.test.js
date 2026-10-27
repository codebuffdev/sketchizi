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
});

test('contextual toolbar has light, dark, responsive, and focus-visible styling', () => {
  assert.match(styles, /\.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-dark \.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-light \.contextual-formatting-toolbar/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?contextual-formatting-toolbar/);
  assert.match(styles, /:focus-visible/);
});


test('Essentials SVG icons expose contextual color swatches and recolor stored SVG artwork', () => {
  assert.match(toolbar, /recolorableIconSelection/);
  assert.match(toolbar, /aria-label="Icon color"/);
  assert.match(toolbar, /aria-label=\{\x60Icon color \$\{label\}\x60\}/);
  const colorService = readFileSync(new URL('../src/features/icon-library/iconColorService.js', import.meta.url), 'utf8');
  const canvasTools = readFileSync(new URL('../src/features/canvas/useCanvasTools.js', import.meta.url), 'utf8');
  assert.match(colorService, /export function recolorSvgMarkup/);
  assert.match(colorService, /WHITE_COLORS/);
  assert.match(colorService, /export function isRecolorableEssentialIcon/);
  assert.match(canvasTools, /recolorSvgDataUrl\(originalDataURL, patch\.strokeColor\)/);
  assert.match(canvasTools, /iconOriginalDataURL: originalDataURL/);
});

test('SVG recoloring preserves white negative space and non-painted areas', () => {
  const colorService = readFileSync(new URL('../src/features/icon-library/iconColorService.js', import.meta.url), 'utf8');
  assert.match(colorService, /PRESERVED_PAINT/);
  assert.match(colorService, /WHITE_COLORS/);
  assert.match(colorService, /export function recolorSvgDataUrl/);
  assert.match(colorService, /category === "eraser icons"/);
});
