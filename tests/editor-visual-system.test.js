import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/editor-visual-system.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('monochrome editor visual system defines balanced light and dark semantic surfaces', () => {
  for (const token of [
    '--sk-editor-surface',
    '--sk-editor-surface-solid',
    '--sk-editor-surface-soft',
    '--sk-editor-border',
    '--sk-editor-border-strong',
    '--sk-editor-ink',
    '--sk-editor-muted',
    '--sk-editor-hover',
    '--sk-editor-selected',
    '--sk-editor-focus',
    '--sk-editor-shadow',
  ]) {
    assert.ok(css.includes(token), `missing editor visual token: ${token}`);
  }
  assert.match(css, /\.app\.theme-light\s*\{/);
  assert.match(css, /\.app\.theme-dark\s*\{/);
});

test('visual refinement is presentation-only and does not alter canvas or dock geometry', () => {
  assert.doesNotMatch(css, /\.App-toolbar|contextual-formatting-toolbar/);
  assert.doesNotMatch(css, /(?:^|[;\n])\s*(?:position|inset|top|right|bottom|left|width|height|min-height|max-height|padding|margin|transform|display)\s*:/);
  assert.match(dock, /\.Island\.App-toolbar\[data-sketchizi-dock="true"\]/);
  assert.ok(entry.indexOf('@import "./styles/editor-visual-system.css";') < entry.indexOf('.kubernetes-library-status'));
});

test('contextual formatting toolbar remains exclusively gated by Zen Mode', () => {
  assert.match(canvas, /\{\(apiRef\.current\?\.getAppState\?\.\(\)\.zenModeEnabled \?\? true\) && \(/);
  assert.match(canvas, /<ContextualFormattingToolbar/);
});

test('header and properties refinements use restrained transitions and reduced-motion support', () => {
  assert.match(css, /--sk-motion-fast/);
  assert.match(css, /--sk-ease-standard/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.desktop-app-header-island/);
  assert.match(css, /\.desktop-app-header-right-rail/);
  assert.match(css, /\.desktop-context-region \.properties-panel/);
});

test('active and focus states remain neutral rather than using the brand accent', () => {
  assert.match(css, /--sk-editor-selected:\s*#e8ebef/);
  assert.match(css, /--sk-editor-focus:\s*#68717c/);
  assert.match(css, /background:\s*var\(--sk-editor-selected\)/);
  assert.match(css, /border-color:\s*var\(--sk-editor-focus\)/);
  assert.doesNotMatch(css, /#(?:6658d3|5949c5|6d28d9|a99cff|8b83ff)/i);
});
