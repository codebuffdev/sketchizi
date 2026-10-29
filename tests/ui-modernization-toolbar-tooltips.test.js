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

test('moves the native Scroll back to content button outside the toolbar dock', () => {
  assert.match(canvas, /button\.classList\.add\("sketchizi-scroll-back-control"\)/);
  assert.match(canvas, /button\.style\.setProperty\("position", "fixed", "important"\)/);
  assert.match(canvas, /const right = dock\.right \+ gap/);
  assert.match(canvas, /const leftOfDock = dock\.left - buttonWidth - gap/);
  assert.match(canvas, /window\.addEventListener\("pointermove", repositionOnPointerMove/);
  assert.match(canvas, /button\.classList\.remove\("sketchizi-scroll-back-control"\)/);
});

test('anchors the Scroll back to content tooltip to its relocated button', () => {
  assert.match(canvas, /The control itself now sits outside the dock/);
  assert.match(canvas, /top = buttonRect\.top - tipRect\.height - 8/);
});
