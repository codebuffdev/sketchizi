import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('removes the unwanted getting-started card from the canvas', () => {
  assert.doesNotMatch(canvas, /Start with an idea|Choose a tool from the dock/);
  assert.doesNotMatch(canvas, /sketchizi-discovery-hint/);
});

test('vertical dock reflows wrapped native tool groups into a column', () => {
  assert.match(dockCss, /data-sketchizi-orientation="vertical"[^}]*flex-direction:\s*column/s);
  assert.match(dockCss, /\.App-toolbar\[data-sketchizi-orientation="vertical"\]\s*>\s*div[^}]*flex-direction:\s*column/s);
});

test('vertical dock preserves native tool visibility and scrolling', () => {
  assert.match(dockCss, /overflow-y:\s*auto/);
  assert.match(dockCss, /visibility:\s*visible\s*!important/);
  assert.match(dockCss, /opacity:\s*1\s*!important/);
});
