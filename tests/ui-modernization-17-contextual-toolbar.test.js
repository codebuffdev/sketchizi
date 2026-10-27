import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const dockStyles = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

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

test('native dock receives contextual selection state without replacing native controls', () => {
  assert.match(canvas, /getContextualDockModel\(selectedElements, \{/);
  assert.match(canvas, /dataset\.sketchiziContext/);
  assert.match(canvas, /dataset\.sketchiziSelectionCount/);
  assert.match(canvas, /dataset\.sketchiziPreserveArtwork/);
  assert.match(dockStyles, /data-sketchizi-context="text"/);
  assert.match(dockStyles, /data-sketchizi-context="shape"/);
});

test('text selection mounts font-size controls directly in the native dock', () => {
  assert.match(canvas, /sketchizi-contextual-controls/);
  assert.match(canvas, /aria-label", "Text formatting"/);
  assert.match(canvas, /Decrease text size/);
  assert.match(canvas, /Increase text size/);
  assert.match(canvas, /applyToSelected\(\{ fontSize: nextSize \}\)/);
  assert.match(canvas, /model\.showTextControls/);
  assert.match(dockStyles, /\.sketchizi-contextual-size-button/);
});

test('shape and connector selections mount native-dock appearance controls', () => {
  assert.match(canvas, /sketchizi-appearance-controls/);
  assert.match(canvas, /Shape and connector appearance/);
  assert.match(canvas, /model\.showStrokeControls/);
  assert.match(canvas, /model\.showShapeControls/);
  assert.match(canvas, /applyToSelected\(\{ \[property\]: color \}\)/);
  assert.match(canvas, /applyToSelected\(\{ strokeWidth: width \}\)/);
  assert.match(canvas, /model\.preserveImageArtwork/);
  assert.match(dockStyles, /\.sketchizi-contextual-color/);
  assert.match(dockStyles, /\.sketchizi-contextual-width-button/);
});

test('native dock exposes selection count and working layer-order actions', () => {
  assert.match(canvas, /sketchizi-selection-controls/);
  assert.match(canvas, /model\.selectedCount === 1 \? "1 selected"/);
  assert.match(canvas, /Bring to front/);
  assert.match(canvas, /Send to back/);
  assert.match(canvas, /api\.getSceneElements\(\)/);
  assert.match(canvas, /api\.updateScene\(\{ elements, captureUpdate: CaptureUpdateAction\.IMMEDIATELY \}\)/);
  assert.match(dockStyles, /\.sketchizi-selection-count/);
  assert.match(dockStyles, /\.sketchizi-layer-button/);
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


test('contextual dock wraps and scrolls within narrow desktop workspaces', () => {
  assert.match(dockStyles, /max-width: calc\(100vw - 24px\)/);
  assert.match(dockStyles, /flex-wrap: wrap/);
  assert.match(dockStyles, /@media \(max-width: 900px\)[\s\S]*?overflow: auto/);
  assert.match(dockStyles, /@media \(max-width: 520px\)/);
});

test('layer-order controls revalidate and synchronize both directions after each reorder', () => {
  assert.match(canvas, /const layerButtons = new Map\(\)/);
  assert.match(canvas, /const syncLayerButtonStates = \(scene\) =>/);
  assert.match(canvas, /layerButtons\.forEach\(\(button, direction\) =>/);
  assert.match(canvas, /if \(!canReorderSelection\(currentScene, selectedIds, direction\)\)/);
  assert.match(canvas, /syncLayerButtonStates\(elements\)/);
});
