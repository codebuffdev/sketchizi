import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('toolbar dock defines a visibly larger premium floating surface', () => {
  assert.match(css, /min-height:\s*62px/);
  assert.match(css, /border-radius:\s*18px/);
  assert.match(css, /linear-gradient\(180deg, #232631 0%, var\(--sk-toolbar-surface\) 100%\)/);
  assert.match(css, /box-shadow:\s*0 18px 44px/);
});

test('toolbar buttons have consistent hit areas and a strong selected state', () => {
  assert.match(css, /width:\s*42px !important/);
  assert.match(css, /\.ToolIcon\.active \.ToolIcon__icon/);
  assert.match(css, /#477f91/);
  assert.match(css, /:focus-visible/);
});

test('toolbar redesign is loaded last and retains responsive, theme, and motion support', () => {
  assert.ok(entry.lastIndexOf('ui-modernization-toolbar-dock.css') > entry.lastIndexOf('ui-modernization.css'));
  assert.match(css, /\.app\.theme-light/);
  assert.match(css, /max-width:\s*700px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.app\.theme-light[\s\S]*?background: color-mix\(in srgb, var\(--ui-surface-solid, #fff\) 55%, transparent\) !important/);
});


test('native and custom quick tools share a 34px footprint and centered dock alignment', () => {
  assert.match(css, /\.Island\.App-toolbar\[data-sketchizi-dock="true"\][\s\S]*?align-items:\s*center\s*!important/);
  assert.match(css, /\.sketchizi-dock-quick-tool[\s\S]*?width:\s*34px\s*!important/);
  assert.match(css, /\.sketchizi-dock-quick-tool[\s\S]*?height:\s*34px\s*!important/);
  assert.match(css, /\.sketchizi-dock-quick-tools[\s\S]*?min-height:\s*34px\s*!important/);
});

test('canvas dock uses the same bordered translucent surface treatment as the right header rail', () => {
  assert.match(css, /\.Island\.App-toolbar\[data-sketchizi-dock="true"\][\s\S]*?border:\s*1px solid var\(--ui-border, #dfe3eb\) !important/);
  assert.match(css, /border-radius:\s*12px !important/);
  assert.match(css, /background:\s*color-mix\(in srgb, var\(--ui-surface-solid, #fff\) 55%, transparent\) !important/);
  assert.match(css, /box-shadow:\s*0 4px 16px rgb\(15 23 42 \/ 8%\) !important/);
  assert.match(css, /\.app\.theme-dark \.excalidraw \.Island\.App-toolbar\[data-sketchizi-dock="true"\][\s\S]*?background:\s*rgb\(32 38 46 \/ 55%\) !important/);
});


test('bottom-left navigation keeps only the zoom percentage visible', () => {
  assert.match(css, /\.zoom-actions \.zoom-out[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.zoom-actions \.zoom-in[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.zoom-actions \.sketchizi-fit-content-button[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.undo-redo-buttons[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.zoom-actions \.reset-zoom[\s\S]*?background:\s*transparent !important/);
});


test('dock uses semantic tool-family separators and a neutral active accent', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /name: "navigation"/);
  assert.match(canvas, /name: "selection-shapes"/);
  assert.match(canvas, /name: "connectors"/);
  assert.match(canvas, /name: "drawing"/);
  assert.match(canvas, /name: "annotation-editing"/);
  assert.match(canvas, /data-sketchizi-dock-layout/);
  assert.match(css, /data-sketchizi-dock-layout="grouped"/);
  assert.match(css, /--sk-dock-group-divider/);
  assert.match(css, /#477f91/);
  assert.doesNotMatch(css, /#7669e8/);
});


test('tool families render as distinct compact clusters rather than a flat toolbar row', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /data\.sketchiziToolGroup = group\.name/);
  assert.match(canvas, /data\.sketchiziGroupStart = "true"/);
  assert.match(css, /\[data-sketchizi-tool-group\][\s\S]*?border-radius:\s*9px/);
  assert.match(css, /\[data-sketchizi-tool-group="navigation"\]/);
  assert.match(css, /\[data-sketchizi-group-start="true"\]/);
  assert.match(css, /width:\s*36px !important/);
  assert.match(css, /background:\s*#477f91 !important/);
});


test('vertical Primary Dock hides only the divider directly before the Hand/navigation tool', () => {
  assert.match(css, /\.App-toolbar\[data-sketchizi-orientation="vertical"\] > \.sketchizi-dock-separator:has\(\+ \[data-sketchizi-tool-group="navigation"\]\)[\s\S]*?display:\s*none !important/);
});
