import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');

test('toolbar hover labels use native accessible names and available shortcut hints', () => {
  assert.match(canvas, /button\.getAttribute\("aria-label"\) \|\| button\.getAttribute\("title"\)/);
  assert.match(canvas, /querySelector\("\.ToolIcon__keybinding"\)/);
  assert.match(canvas, /button\.title = tooltip/);
});

test('toolbar enhancement preserves native controls and does not recreate or reorder tools', () => {
  assert.match(canvas, /Never reorder or wrap tools/);
  assert.match(canvas, /toolbar\.insertBefore\(separator, anchor\)/);
  assert.doesNotMatch(canvas, /button\.addEventListener\("click"/);
  assert.doesNotMatch(canvas, /button\.replaceWith\(/);
});

test('toolbar decoration continues to observe native DOM updates', () => {
  assert.match(canvas, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(canvas, /observer\?\.disconnect\(\)/);
});
