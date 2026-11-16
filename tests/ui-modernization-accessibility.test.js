import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/ui-modernization-07-accessibility-interaction.md', import.meta.url), 'utf8');

test('keyboard users receive a visible focus indicator on interactive controls', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline-offset:\s*3px/);
  assert.match(css, /--focus-ring/);
});

test('forced-colors mode uses system highlight colors', () => {
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(css, /outline:\s*2px solid Highlight/);
  assert.match(css, /color:\s*GrayText/);
});

test('reduced-motion preference disables nonessential motion', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms/);
  assert.match(css, /transition-duration:\s*0\.01ms/);
});

test('coarse pointer controls receive minimum touch targets and manual checks are documented', () => {
  assert.match(css, /@media\s*\(pointer:\s*coarse\)/);
  assert.match(css, /min-height:\s*max\(40px/);
  assert.match(docs, /Tab\/Shift\+Tab/);
  assert.match(docs, /Escape behavior/);
});
