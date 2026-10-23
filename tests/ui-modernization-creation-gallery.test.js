import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../src/features/design/ui/CreateDesignScreen.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/features/design/design.css', import.meta.url), 'utf8');

test('creation gallery provides live result counts and a clear-search action', () => {
  assert.match(screen, /design-studio-results-meta/);
  assert.match(screen, /aria-live="polite"/);
  assert.match(screen, /aria-label="Clear template search"/);
  assert.match(screen, /setSearch\(""\)/);
});

test('empty template results provide an accessible filter reset', () => {
  assert.match(screen, /design-studio-empty-reset/);
  assert.match(screen, /setCategory\("all"\)/);
  assert.match(screen, /Clear filters/);
});

test('creation screen styling includes premium card states, dark theme, and responsive motion support', () => {
  for (const selector of ['.design-studio-template-card:hover', '.design-studio-template-card:focus-visible', '.design-studio-results-meta', '.design-studio-dark .design-studio-template-card', '.design-studio-search:focus-within']) {
    assert.ok(css.includes(selector), `missing expected selector: ${selector}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
});
