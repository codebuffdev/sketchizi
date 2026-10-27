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


test('compact dock constrains overall width and reduces tool button dimensions', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /min-height: 48px !important/);
  assert.match(dockCss, /padding: 5px 8px !important/);
  assert.match(dockCss, /width: 34px !important/);
  assert.match(dockCss, /max-width: calc\(100vw - 16px\) !important/);
  assert.match(dockCss, /@media \(max-width: 700px\)[\s\S]*?width: 31px !important/);
});


test('zoom and undo redo navigation controls use compact dimensions', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.zoom-actions button,[\s\S]*?width: 34px !important/);
  assert.match(dockCss, /\.undo-redo-buttons button/);
  assert.match(dockCss, /@media \(max-width: 700px\)[\s\S]*?width: 31px !important/);
});


test('floating dock has no enclosing background shell', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.Island\.App-toolbar\[data-sketchizi-dock="true"\][\s\S]*?background: transparent !important/);
  assert.match(dockCss, /border-radius: 0 !important/);
  assert.match(dockCss, /box-shadow: none !important/);
  assert.match(dockCss, /backdrop-filter: none !important/);
});


test('dock hides inline shortcut hints without disabling keyboard shortcuts', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.App-toolbar\[data-sketchizi-dock="true"\] \.ToolIcon__keybinding[\s\S]*?display: none !important/);
  assert.match(dockCss, /Keyboard shortcuts themselves remain available and unchanged/);
});


test('contextual toolbar exposes fill, line, roughness and opacity controls on canvas', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Fill style"/);
  assert.match(toolbar, /aria-label="Line style"/);
  assert.match(toolbar, /aria-label="Roughness"/);
  assert.match(toolbar, /aria-label="Opacity"/);
  assert.match(toolbar, /applyToSelected\(\{ fillStyle: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ strokeStyle: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ roughness: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ opacity: Number\(event.target.value\) \}\)/);
  assert.match(dockCss, /\.contextual-formatting-toolbar[\s\S]*?max-width: min\(760px, calc\(100vw - 20px\)\)/);
});


test('contextual toolbar provides canvas layer ordering actions', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Layer order"/);
  assert.match(toolbar, /aria-label="Send selection to back"/);
  assert.match(toolbar, /aria-label="Bring selection to front"/);
  assert.match(toolbar, /api\.updateScene\(\{ elements: nextElements \}\)/);
});


test('contextual toolbar controls have visible contrast in light and dark themes', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.app\.theme-light \.contextual-formatting-toolbar[\s\S]*?--contextual-ink: #20242c/);
  assert.match(dockCss, /\.app\.theme-dark \.contextual-formatting-toolbar[\s\S]*?--contextual-ink: #f3f4f8/);
  assert.match(dockCss, /\.contextual-color-swatch[\s\S]*?background-color: var\(--swatch-color, transparent\) !important/);
  assert.match(dockCss, /\.contextual-color-swatch\.is-selected[\s\S]*?outline: 2px solid #8276f4/);
  assert.match(dockCss, /\.contextual-formatting-toolbar button:focus-visible/);
});
