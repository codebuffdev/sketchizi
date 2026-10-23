import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('dock supports keyboard movement with viewport clamping', () => {
  assert.match(canvas, /grip\.addEventListener\("keydown"/);
  assert.match(canvas, /ArrowLeft/);
  assert.match(canvas, /window\.innerWidth - rect\.width - 8/);
  assert.match(canvas, /window\.addEventListener\("resize", clampDockToViewport\)/);
  assert.match(canvas, /window\.removeEventListener\("resize", clampDockToViewport\)/);
});

test('mobile dock remains reachable through horizontal scrolling', () => {
  assert.match(css, /max-width:\s*calc\(100vw - 16px\)/);
  assert.match(css, /overflow-x:\s*auto !important/);
  assert.match(css, /overscroll-behavior-x:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
});

test('drag handle has a visible keyboard focus indicator', () => {
  assert.match(css, /\.sketchizi-dock-grip:focus-visible/);
  assert.match(css, /outline:\s*2px solid #b9b2ff/);
});
