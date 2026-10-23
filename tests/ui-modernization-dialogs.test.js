import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');

test('dialogs and confirmation surfaces share a premium visual system', () => {
  for (const selector of ['.design-dialog-backdrop', '.design-confirm-dialog', '.auth-dialog', '.collaboration-dialog', 'backdrop-filter: blur(5px)', 'border-radius: var(--sk-radius-dialog)']) {
    assert.ok(css.includes(selector), `missing dialog modernization rule: ${selector}`);
  }
  assert.match(css, /\.app\.theme-dark[\s\S]*?background:\s*#171b28/);
});

test('menus and popovers have consistent surfaces and interaction states', () => {
  assert.match(css, /\.desktop-app-dropdown, \.auth-account-menu/);
  assert.match(css, /button:hover\s*\{[\s\S]*?background:\s*var\(--ui-hover/);
});

test('forms and interactive controls have visible keyboard focus', () => {
  assert.match(css, /:is\(input, select, textarea\):focus-visible/);
  assert.match(css, /button, \[role="button"\], a\):focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('dialog layouts adapt to small screens', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /max-height:\s*calc\(100dvh - 24px\)/);
});
