import test from 'node:test';
import assert from 'node:assert/strict';
import { getScrollBackPlacement } from '../src/features/canvas/scrollBackPlacement.js';

const dock = { left: 380, right: 820, top: 700, bottom: 748, width: 440, height: 48 };

test('horizontal button is centered above the bottom toolbar', () => {
  assert.deepEqual(getScrollBackPlacement({ dock, viewportWidth: 1200, viewportHeight: 800 }), { left: 526, top: 646 });
});

test('horizontal button follows a moved toolbar instead of anchoring at screen center', () => {
  const moved = { ...dock, left: 100, right: 540, top: 280, bottom: 328 };
  assert.deepEqual(getScrollBackPlacement({ dock: moved, viewportWidth: 1200, viewportHeight: 800 }), { left: 246, top: 226 });
});

test('small phone viewport keeps the centered button visible', () => {
  const mobile = { left: 8, right: 312, top: 690, bottom: 730, width: 304, height: 40 };
  assert.deepEqual(getScrollBackPlacement({ dock: mobile, viewportWidth: 320, viewportHeight: 760 }), { left: 86, top: 636 });
});

test('docks near the top place the button below instead', () => {
  const nearTop = { left: 350, right: 750, top: 12, bottom: 60, width: 400, height: 48 };
  assert.deepEqual(getScrollBackPlacement({ dock: nearTop, viewportWidth: 1100, viewportHeight: 800 }), { left: 476, top: 72 });
});

test('vertical docks preserve their side-positioned button', () => {
  const verticalDock = { left: 1100, right: 1148, top: 250, bottom: 650, width: 48, height: 400 };
  assert.deepEqual(getScrollBackPlacement({ dock: verticalDock, viewportWidth: 1200, viewportHeight: 800, vertical: true, dockSide: 'right' }), { left: 940, top: 429 });
});
