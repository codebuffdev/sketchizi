import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Primary Dock is a React component with no drag gesture, so the former
// "single drag cleanup path" requirement is carried by its listener and timer
// lifecycle: everything it registers is released on unmount.
const dock = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');

test('dock has no native drag machinery left to leak window listeners', () => {
  assert.doesNotMatch(canvas, /activeDragCleanup/);
  assert.doesNotMatch(dock, /pointermove|pointerup|pointercancel/);
});

test('dock window listeners are removed by the same effect that adds them', () => {
  assert.match(dock, /window\.addEventListener\("sketchizi:activate-tool", syncCustomTool\)/);
  assert.match(dock, /window\.removeEventListener\("sketchizi:activate-tool", syncCustomTool\)/);
  assert.match(dock, /window\.addEventListener\("click", clearCustomTool, true\)/);
  assert.match(dock, /window\.removeEventListener\("click", clearCustomTool, true\)/);
});

test('pending collapse timers are cancelled on unmount and before rescheduling', () => {
  assert.match(dock, /useEffect\(\(\) => \(\) => \{\s*\[collapseTimerRef, openTimerRef, closeTimerRef, tooltipTimerRef\]\.forEach\(clearTimer\);\s*\}, \[\]\)/);
  assert.match(dock, /const scheduleCollapse = \(\) => \{\s*cancelCollapseTimer\(\);/);
  assert.match(dock, /collapseTimerRef\.current = null;/);
});
