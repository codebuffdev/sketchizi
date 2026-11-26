import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('dock is keyboard operable and stays within the viewport', () => {
  const dock = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ipad-radial-tool-wheel.css', import.meta.url), 'utf8');
  assert.match(dock, /onBlurCapture=\{\(event\) => \{\s*if \(!event\.currentTarget\.contains\(event\.relatedTarget\) && !pinnedRef\.current\) scheduleCollapse\(\);/);
  assert.match(dock, /firstSlotButtonRef\.current\?\.focus\(\)/);
  assert.match(dock, /aria-label=\{`Active tool: \$\{pillChild\.label\}\. Expand drawing tools`\}/);
  // Enter/ArrowRight open the child rail and focus its first child; Escape closes it.
  assert.match(dock, /event\.key === "Enter" \|\| event\.key === "ArrowRight"/);
  assert.match(dock, /event\.key !== "Escape"/);
  assert.match(dockCss, /max-height: calc\(100dvh - 112px\)/);
  assert.doesNotMatch(canvas, /clampDockToViewport/);
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
