import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('dragging near either horizontal screen edge switches the dock to vertical orientation', () => {
  assert.match(canvas, /edgeThreshold = 28/);
  assert.match(canvas, /proposedLeft <= edgeThreshold/);
  assert.match(canvas, /dockRight >= window\.innerWidth - edgeThreshold/);
  assert.match(canvas, /dataset\.sketchiziOrientation = verticalSide \? "vertical" : "horizontal"/);
});

test('vertical dock stacks tools and turns group separators horizontal', () => {
  assert.match(css, /App-toolbar\[data-sketchizi-orientation="vertical"\]\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /data-sketchizi-orientation="vertical"\]\s*\.sketchizi-dock-separator\s*\{[^}]*width:\s*28px/s);
  assert.match(css, /data-sketchizi-orientation="vertical"\]\s*\.sketchizi-dock-grip\s*\{[^}]*flex-direction:\s*row/s);
});
