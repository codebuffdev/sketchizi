import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CSS_PIXELS_PER_CM,
  GRID_SPOTLIGHT_RADIUS_CM,
  spotlightRadius,
  spotlightCenter,
  spotlightElementCenter,
  spotlightGridPattern,
} from '../src/features/canvas/gridSpotlight.js';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/grid-spotlight.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('preferred radius is 13 CSS cm but clamped to 42 percent of viewport dimensions', () => {
  assert.equal(GRID_SPOTLIGHT_RADIUS_CM, 13);
  assert.ok(Math.abs(CSS_PIXELS_PER_CM * 13 - 491.34) < 1);
  assert.equal(spotlightRadius(1800, 1400), Math.round(13 * CSS_PIXELS_PER_CM));
  assert.equal(spotlightRadius(1280, 800), 336);
  assert.equal(spotlightRadius(390, 740), 164);
  assert.equal(spotlightRadius(320, 0), 0);
  assert.equal(spotlightRadius(0, 800), 0);
});

test('editing focus is clamped to the drawing surface and defaults to center', () => {
  assert.deepEqual(spotlightCenter(undefined, undefined, 1000, 600), { x: 500, y: 300 });
  assert.deepEqual(spotlightCenter(-500, 800, 1000, 600), { x: 0, y: 600 });
  assert.deepEqual(spotlightCenter(999.7, 12.7, 1000, 600), { x: 1000, y: 13 });
});

test('selected element center follows Excalidraw pan and zoom', () => {
  const shape = { x: 100, y: 200, width: 80, height: 40 };
  assert.deepEqual(spotlightElementCenter(shape, { zoom: { value: 2 }, scrollX: -10, scrollY: 30 }), { x: 260, y: 500 });
  assert.deepEqual(spotlightElementCenter(shape, { zoom: { value: 1 }, scrollX: 0, scrollY: 0 }), { x: 140, y: 220 });
  assert.equal(spotlightElementCenter({ ...shape, isDeleted: true }, {}), null);
  assert.equal(spotlightElementCenter(shape, { zoom: 0 }), null);
});

test('dot spacing and offsets adapt to zoom and pan', () => {
  assert.deepEqual(spotlightGridPattern({ gridSize: 20, zoom: { value: 1 }, scrollX: -5, scrollY: 8 }), { spacing: 20, offsetX: 15, offsetY: 8 });
  assert.deepEqual(spotlightGridPattern({ gridSize: 20, zoom: { value: 2 }, scrollX: 10, scrollY: -10 }), { spacing: 40, offsetX: 20, offsetY: 20 });
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: { value: 0.1 } }).spacing, 8);
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: { value: 10 } }).spacing, 72);
});

test('grid spotlight only decorates the static canvas and cannot intercept pointer input', () => {
  assert.match(entry, /import "\.\/styles\/grid-spotlight\.css"/);
  assert.match(canvas, /\.excalidraw__canvas-wrapper/);
  assert.match(canvas, /layer\.className = "sketchizi-grid-spotlight"/);
  assert.match(canvas, /layer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(canvas, /root\.addEventListener\("pointermove", onPointerMove/);
  assert.match(canvas, /root\.addEventListener\("input", schedulePaint, true\)/);
  assert.match(canvas, /spotlightElementCenter\(selected\[0\], appState\)/);
  assert.match(css, /pointer-events: none !important/);
  assert.match(css, /clip-path: circle\(var\(--sk-grid-focus-radius\) at/);
  assert.match(css, /mask-image: radial-gradient/);
  assert.match(css, /\.app\.theme-dark \.desktop-canvas-region,\s*\.app\.theme-light \.desktop-canvas-region\s*\{\s*background-image: none !important;/);
});

test('native Excalidraw grid and snapping are not disabled or replaced', () => {
  assert.match(canvas, /gridModeEnabled: savedSketch\?\.appState\?\.gridModeEnabled \?\? gridEnabled/);
  assert.doesNotMatch(canvas, /gridModeEnabled:\s*false/);
  assert.doesNotMatch(canvas, /\.updateScene\(\{\s*appState:\s*\{\s*gridModeEnabled:\s*false/s);
});
