import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');

const primaryDock = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');

test('dock hover labels use accessible names and available shortcut hints', () => {
  assert.match(primaryDock, /aria-label=\{tool\.label\}/);
  assert.match(primaryDock, /title=\{tool\.keyHint \? `\$\{tool\.label\} \(\$\{tool\.keyHint\}\)` : tool\.label\}/);
  // Native zoom/undo/redo controls get a title only when they have none.
  assert.match(canvas, /if \(!button\.getAttribute\("title"\)\) button\.setAttribute\("title", title\)/);
  assert.match(canvas, /if \(!button\.getAttribute\("aria-label"\)\) button\.setAttribute\("aria-label", "Scroll back to content"\)/);
});

test('canvas never recreates, wraps or reorders native tools; the dock renders its own fixed tool list', () => {
  assert.doesNotMatch(canvas, /button\.replaceWith\(|toolbar\.insertBefore\(|Never reorder or wrap tools/);
  assert.match(primaryDock, /\{TOOLS\.map\(\(tool, toolIndex\) => \{/);
});

test('toolbar decoration continues to observe native DOM updates', () => {
  assert.match(canvas, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(canvas, /observer\?\.disconnect\(\)/);
});

test('positions the native Scroll back to content action at the canvas bottom edge, clear of the contextual dock', () => {
  assert.match(canvas, /button\.classList\.add\("sketchizi-scroll-back-control"\)/);
  assert.match(canvas, /getScrollBackPlacement\(\{/);
  assert.match(canvas, /bottomAligned: true/);
  assert.match(canvas, /const contextualDock = root\.querySelector\("\.sketchizi-tool-options-dock"\)/);
  assert.match(canvas, /button\.style\.setProperty\("position", "fixed", "important"\)/);
  assert.match(canvas, /button\.style\.setProperty\("left", `\$\{position\.left\}px`, "important"\)/);
  assert.match(canvas, /button\.style\.setProperty\("top", `\$\{position\.top\}px`, "important"\)/);
  assert.match(canvas, /window\.addEventListener\("resize", placeScrollBackControl\)/);
  assert.match(canvas, /window\.removeEventListener\("resize", placeScrollBackControl\)/);
  assert.match(canvas, /button\.classList\.remove\("sketchizi-scroll-back-control"\)/);
});

test('Scroll back to content keeps an accessible name and the native duplicate tooltip is hidden', () => {
  assert.match(canvas, /button\.dataset\.sketchiziTooltip = "Scroll back to content"/);
  assert.match(canvas, /const suppressNativeScrollBackTooltip = \(\) => \{/);
  assert.match(canvas, /tooltip\.style\.setProperty\("display", "none", "important"\)/);
});
