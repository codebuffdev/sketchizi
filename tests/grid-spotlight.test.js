import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CSS_PIXELS_PER_CM,
  GRID_SPOTLIGHT_RADIUS_CM,
  spotlightRadius,
  workspaceGridRadii,
  spotlightCenter,
  spotlightElementCenter,
  spotlightGridPattern,
  workspaceCoarseGridPattern,
} from '../src/features/canvas/gridSpotlight.js';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/grid-spotlight.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('preferred focus size stays responsive without promising physical centimeters', () => {
  assert.equal(GRID_SPOTLIGHT_RADIUS_CM, 13);
  assert.ok(Math.abs(CSS_PIXELS_PER_CM * 13 - 491.34) < 1);
  assert.equal(spotlightRadius(1800, 1400), Math.round(13 * CSS_PIXELS_PER_CM));
  assert.equal(spotlightRadius(1280, 800), 336);
  assert.deepEqual(workspaceGridRadii(1800, 1100), { x: 590, y: 452 });
  assert.deepEqual(workspaceGridRadii(1280, 800), { x: 590, y: 376 });
  assert.deepEqual(workspaceGridRadii(390, 740), { x: 187, y: 348 });
  assert.deepEqual(workspaceGridRadii(0, 800), { x: 0, y: 0 });
});

test('work anchor is clamped to the canvas; an unanchored scene starts centered', () => {
  assert.deepEqual(spotlightCenter(undefined, undefined, 1000, 600), { x: 500, y: 300 });
  assert.deepEqual(spotlightCenter(-500, 800, 1000, 600), { x: 0, y: 600 });
  assert.deepEqual(spotlightCenter(999.7, 12.7, 1000, 600), { x: 1000, y: 13 });
  const shape = { x: 100, y: 200, width: 80, height: 40 };
  assert.deepEqual(spotlightElementCenter(shape, { zoom: { value: 2 }, scrollX: -10, scrollY: 30 }), { x: 260, y: 500 });
  assert.equal(spotlightElementCenter({ ...shape, isDeleted: true }, {}), null);
});

test('fine and macro square grids retain scene alignment while zooming and panning', () => {
  assert.deepEqual(spotlightGridPattern({ gridSize: 20, zoom: { value: 1 }, scrollX: -5, scrollY: 8 }), { spacing: 20, offsetX: 15, offsetY: 8 });
  assert.deepEqual(workspaceCoarseGridPattern({ gridSize: 20, zoom: { value: 1 }, scrollX: -5, scrollY: 8 }), { spacing: 80, offsetX: 75, offsetY: 8 });
  assert.deepEqual(workspaceCoarseGridPattern({ gridSize: 20, zoom: { value: 2 }, scrollX: 10, scrollY: -10 }), { spacing: 160, offsetX: 20, offsetY: 140 });
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: { value: 0.1 } }).spacing, 8);
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: { value: 10 } }).spacing, 72);
});

test('idle mouse hover never reveals or repositions the work grid', () => {
  assert.match(canvas, /const onPointerMove = \(event\) => \{\s*\/\/ Merely moving the mouse must NOT turn on or move the focus grid\./);
  assert.match(canvas, /drawingPointerId !== event\.pointerId \|\| drawingPointerId === null/);
  assert.match(canvas, /const onPointerDown = \(event\) => \{/);
  assert.match(canvas, /isNativeDrawingSurface\(event\.target\)/);
  assert.match(canvas, /root\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(canvas, /root\.addEventListener\("pointermove", onPointerMove/);
  assert.match(css, /\.sketchizi-grid-spotlight\s*\{[^}]*opacity: 0;/s);
  assert.match(css, /\.sketchizi-grid-spotlight\.is-active\s*\{\s*opacity: 1;/);
});

test('drawing, typing and icon-drop activity reveal the grid, then inactivity hides it', () => {
  assert.match(canvas, /root\.addEventListener\("focusin", onTextFocus, true\)/);
  assert.match(canvas, /root\.addEventListener\("input", onTextInput, true\)/);
  assert.match(canvas, /root\.addEventListener\("drop", onDrop, true\)/);
  assert.match(canvas, /layer\?\.classList\.add\("is-active"\)/);
  assert.match(canvas, /layer\?\.classList\.remove\("is-active"\)/);
  assert.match(canvas, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 3200\)/);
  assert.match(canvas, /window\.addEventListener\("pointerup", onPointerEnd, true\)/);
  assert.match(canvas, /const editor = root\.querySelector\("\.excalidraw-textEditorContainer textarea"\)/);
});

test('soft vignette is wide and layered, with no hard circular clipping or dot stamps', () => {
  assert.match(entry, /import "\.\/styles\/grid-spotlight\.css"/);
  assert.match(canvas, /layer\.className = "sketchizi-grid-spotlight"/);
  assert.match(canvas, /layer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(css, /pointer-events: none !important/);
  assert.match(css, /sketchizi-grid-spotlight::before/);
  assert.match(css, /sketchizi-grid-spotlight::after/);
  assert.match(css, /--sk-grid-coarse-size/);
  assert.match(css, /linear-gradient\(to right,/);
  assert.match(css, /linear-gradient\(to bottom,/);
  assert.match(css, /mask-image: radial-gradient\(\s*ellipse/);
  assert.doesNotMatch(css, /clip-path:\s*circle/);
  assert.doesNotMatch(css, /background-image:\s*radial-gradient/);
  assert.match(css, /\.app\.theme-dark \.desktop-canvas-region,\s*\.app\.theme-light \.desktop-canvas-region\s*\{\s*background-image: none !important;/);
});

test('visual-only focus never disables Excalidraw grid snapping, edits or exports', () => {
  assert.match(canvas, /gridModeEnabled: savedSketch\?\.appState\?\.gridModeEnabled \?\? gridEnabled/);
  assert.doesNotMatch(canvas, /gridModeEnabled:\s*false/);
  assert.doesNotMatch(canvas, /\.updateScene\(\{\s*appState:\s*\{\s*gridModeEnabled:\s*false/s);
});
