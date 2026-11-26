import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('the Primary Dock is always a vertical left-edge stack, with no drag-to-edge orientation switching', () => {
  const dock = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ipad-radial-tool-wheel.css', import.meta.url), 'utf8');
  assert.doesNotMatch(canvas, /edgeThreshold|sketchiziOrientation/);
  assert.match(dock, /className="sketchizi-tool-sidebar-list"/);
  assert.match(dockCss, /\.sketchizi-tool-sidebar \{\s*position: fixed !important;\s*left: 20px !important/);
});

test('vertical dock stacks tools and turns group separators horizontal', () => {
  assert.match(css, /App-toolbar\[data-sketchizi-orientation="vertical"\]\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /data-sketchizi-orientation="vertical"\]\s*\.sketchizi-dock-separator\s*\{[^}]*width:\s*28px/s);
  assert.match(css, /data-sketchizi-orientation="vertical"\]\s*\.sketchizi-dock-grip\s*\{[^}]*flex-direction:\s*row/s);
});
