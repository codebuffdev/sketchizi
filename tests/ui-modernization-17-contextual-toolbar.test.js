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
  assert.match(toolbar, /Math\.min\(520, rootWidth - 16\)/);
  assert.match(toolbar, /canvasRevision/);
  assert.match(toolbar, /const belowTop = bottomY \+ 10/);
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


test('contextual toolbar exposes fill, line and opacity controls without duplicate roughness controls', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Fill style"/);
  assert.match(toolbar, /aria-label="Line style"/);
  assert.match(toolbar, /aria-label="Opacity"/);
  assert.match(toolbar, /applyToSelected\(\{ fillStyle: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ strokeStyle: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ opacity: Number\(event.target.value\) \}\)/);
  assert.match(dockCss, /\.contextual-formatting-toolbar[\s\S]*?max-width: min\(760px, calc\(100vw - 20px\)\)/);
  assert.doesNotMatch(toolbar, /aria-label="Roughness"/);
  assert.doesNotMatch(toolbar, /ROUGHNESS\.map/);
});


test('contextual toolbar provides canvas layer ordering actions', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Layer order"/);
  assert.match(toolbar, /aria-label="Send selection to back"/);
  assert.match(toolbar, /aria-label="Bring selection to front"/);
  assert.match(toolbar, /api\.updateScene\(\{ elements: nextElements \}\)/);
});


test('scroll-back-to-content control is offset above the bottom dock', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  const rules = dockCss.slice(dockCss.lastIndexOf('/* Keep Excalidraw\'s "Scroll back to content"'));
  assert.match(rules, /\.scroll-back-to-content[\s\S]*?bottom: calc\(var\(--sketchizi-dock-clearance, 64px\)/);
  assert.match(rules, /z-index: 20 !important/);
  assert.match(rules, /@media \(max-height: 620px\)/);
});


test('contextual toolbar stays above bottom dock and keeps frameless high-contrast controls', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /bottomDockClearance = 88/);
  assert.match(toolbar, /usableBottom - toolbarHeight/);
  const frameless = dockCss.slice(dockCss.lastIndexOf('/* Preserve the canvas-native'));
  assert.match(frameless, /background: transparent !important/);
  assert.match(frameless, /border: 0 !important/);
  assert.match(frameless, /\.contextual-formatting-group > button[\s\S]*?border: 1px solid rgb\(71 85 105 \/ 34%\) !important/);
  assert.match(frameless, /\.app:has\(\.excalidraw\.theme--dark\)[\s\S]*?color: #f8fafc !important/);
});


test('contextual stroke and fill swatches keep their real colors in both themes', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  const swatches = dockCss.slice(dockCss.lastIndexOf('/* Color controls must retain'));
  assert.match(swatches, /button\.contextual-color-swatch[\s\S]*?background: var\(--swatch-color, transparent\) !important/);
  assert.match(swatches, /background-color: var\(--swatch-color, transparent\) !important/);
  assert.match(swatches, /button\.contextual-color-swatch\.is-transparent[\s\S]*?linear-gradient/);
  assert.match(swatches, /\.app:has\(\.excalidraw\.theme--dark\)[\s\S]*?button\.contextual-color-swatch/);
  assert.match(swatches, /button\.contextual-color-swatch\.is-selected[\s\S]*?border: 2px solid #6366f1/);
});


test('contextual toolbar offers a native custom stroke and text color picker', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Custom color"/);
  assert.match(toolbar, /type="color"/);
  assert.match(toolbar, /aria-label="Choose custom color"/);
  assert.match(toolbar, /applyToSelected\(\{ strokeColor: event\.target\.value \}\)/);
  assert.match(dockCss, /\.contextual-custom-color input\[type="color"\]/);
});


test('contextual toolbar clamps to viewport and scrolls its controls on narrow screens', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /Math\.min\(520, rootWidth - 16\)/);
  const rules = dockCss.slice(dockCss.lastIndexOf('/* Keep the contextual toolbar inside'));
  assert.match(rules, /max-width: calc\(100vw - 16px\) !important/);
  assert.match(rules, /overflow-x: auto !important/);
  assert.match(rules, /flex-wrap: nowrap !important/);
  assert.match(rules, /\.contextual-formatting-group > button,[\s\S]*?flex-shrink: 0 !important/);
});


test('text selection exposes a clickable minimal font picker with an underlined A', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Font family"/);
  assert.match(toolbar, /aria-label="Change font family"/);
  assert.match(toolbar, /onChange=\{\(event\) => applyToSelected\(\{ fontFamily: Number\(event\.target\.value\) \}\)\}/);
  assert.match(toolbar, /\[1, "Virgil"\]/);
  assert.match(toolbar, /\[5, "Excalifont"\]/);
  assert.match(toolbar, /\[9, "Liberation Sans"\]/);
  assert.match(dockCss, /\.contextual-font-trigger/);
  assert.match(dockCss, /\.contextual-font-underline[\s\S]*?width: 26px/);
  assert.match(dockCss, /\.contextual-font-trigger select[\s\S]*?opacity: 0 !important/);
});


test('horizontal dock tooltips stay above the dock instead of overlapping neighboring tools', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /top = buttonRect\.top - tipRect\.height - 8/);
  assert.match(canvas, /Never place a dock tooltip below its trigger/);
  assert.match(canvas, /if \(top < 8\) top = 8/);
  assert.doesNotMatch(canvas, /if \(top < 8\) top = buttonRect\.bottom \+ 8/);
});
