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
  assert.match(css, /linear-gradient\(145deg, #7669e8, #5b50bc\)/);
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
