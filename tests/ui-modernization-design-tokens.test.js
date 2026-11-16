import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../src/styles/design-tokens.css', import.meta.url), 'utf8');
const modern = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/ui-modernization-08-design-system-tokens.md', import.meta.url), 'utf8');

test('central token sheet defines color, geometry, spacing, elevation, motion and touch scales', () => {
  for (const token of ['--sk-color-accent', '--sk-radius-control', '--sk-space-4', '--sk-shadow-panel', '--sk-motion-standard', '--sk-touch-target-min']) {
    assert.ok(tokens.includes(token), `missing token ${token}`);
  }
});

test('light and dark themes define semantic surface, border, text and accent aliases', () => {
  for (const theme of ['.app.theme-light', '.app.theme-dark']) assert.ok(tokens.includes(theme));
  for (const token of ['--ui-surface:', '--ui-border:', '--ui-text-strong:', '--ui-accent:']) assert.ok(tokens.includes(token));
});

test('modernization styles import the central tokens and consume shared geometry/elevation tokens', () => {
  assert.match(modern, /@import\s+["']\.\/design-tokens\.css["']/);
  assert.match(modern, /var\(--sk-radius-control/);
  assert.match(modern, /var\(--sk-shadow-card-hover/);
});

test('token documentation preserves legacy aliases and calls for real-browser theme validation', () => {
  assert.match(docs, /legacy aliases/);
  assert.match(docs, /real browser/);
});

test('visual consistency pass routes common modernization radii through shared tokens', () => {
  assert.doesNotMatch(modern, /border-radius:\s*(?:4|8|9|10|11|12|13|14|16)px\s*;/);
  for (const token of ['--sk-radius-sm', '--sk-radius-control-sm', '--sk-radius-control', '--sk-radius-card-sm', '--sk-radius-card', '--sk-radius-dialog']) {
    assert.ok(modern.includes(`var(${token})`), `modernization styles should consume ${token}`);
  }
});

test('visual consistency pass routes common transition timings through shared motion tokens', () => {
  assert.doesNotMatch(modern, /transition:[^;]*\.(?:14|15|16|22)s\s+ease/);
  assert.match(modern, /var\(--sk-motion-fast\) var\(--sk-ease-standard\)/);
  assert.match(modern, /var\(--sk-motion-standard\) var\(--sk-ease-standard\)/);
});
