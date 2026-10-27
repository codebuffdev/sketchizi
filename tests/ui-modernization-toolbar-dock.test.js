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
  assert.doesNotMatch(css, /\.App-toolbar\[data-sketchizi-dock="true"\][^{}]*\{[^}]*display:\s*none\s*!important/);
});
