import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');

test('toolbar hover labels use native accessible names and available shortcut hints', () => {
  assert.match(canvas, /button\.getAttribute\("aria-label"\) \|\| button\.getAttribute\("title"\)/);
  assert.match(canvas, /querySelector\("\.ToolIcon__keybinding"\)/);
  assert.match(canvas, /button\.dataset\.sketchiziTooltip = tooltip/);
  assert.match(canvas, /button\.removeAttribute\("title"\)/);
  assert.match(canvas, /if \(!button\.getAttribute\("aria-label"\)\) button\.setAttribute\("aria-label", accessibleName\)/);
});

test('toolbar enhancement preserves native controls and does not recreate or reorder tools', () => {
  assert.match(canvas, /Never reorder or wrap tools/);
  assert.match(canvas, /toolbar\.insertBefore\(separator, anchor\)/);
  assert.match(canvas, /button\.addEventListener\("click"/);
  assert.doesNotMatch(canvas, /button\.replaceWith\(/);
});

test('toolbar decoration continues to observe native DOM updates', () => {
  assert.match(canvas, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(canvas, /observer\?\.disconnect\(\)/);
});

test('scroll-back tooltip is positioned beside the right edge of the dock', () => {
  assert.match(canvas, /scrollBackTooltip && toolbar/);
  assert.match(canvas, /left = toolbarRect\.right \+ 12/);
  assert.match(canvas, /top = toolbarRect\.top \+ \(toolbarRect\.height - tipRect\.height\) \/ 2/);
  assert.match(canvas, /left = toolbarRect\.left - tipRect\.width - 12/);
});
