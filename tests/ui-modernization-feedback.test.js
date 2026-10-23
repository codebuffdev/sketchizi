import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');

test('feedback notices share consistent border, radius, and elevation', () => {
  assert.match(css, /community-notice[\s\S]*?border-radius:\s*var\(--sk-radius-card-sm\)/);
  assert.match(css, /collaboration-permission-success/);
  assert.match(css, /architecture-review-filter-status/);
});

test('empty states have clear surface, spacing, and readable text treatment', () => {
  for (const selector of ['.architecture-review-empty', '.collaboration-chat-empty', '.collaboration-recovery-empty', '.sketchizi-command-empty']) {
    assert.ok(css.includes(selector), `missing empty-state styling: ${selector}`);
  }
  assert.match(css, /border:\s*1px dashed var\(--ui-border/);
  assert.match(css, /text-align:\s*center/);
});

test('loading and progress states use the shared accent and rounded progress geometry', () => {
  assert.match(css, /collaboration-header-spinner[\s\S]*?border-top-color:\s*var\(--ui-accent/);
  assert.match(css, /collaboration-recovery-progress[\s\S]*?border-radius:\s*999px/);
});

test('feedback styling respects dark theme, mobile layout, and reduced motion', () => {
  assert.match(css, /\.app\.theme-dark[\s\S]*?collaboration-recovery-empty/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
