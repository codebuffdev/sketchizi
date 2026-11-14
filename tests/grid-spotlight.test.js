import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  spotlightCenter,
  spotlightElementCenter,
  spotlightGridPattern,
  workspaceCoarseGridPattern,
  workspaceFocusRect,
} from '../src/features/canvas/gridSpotlight.js';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/grid-spotlight.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('fine grid has no focus on empty idle canvas; coarse grid remains visible', () => {
  assert.equal(workspaceFocusRect({ elements: [], width: 1280, height: 800 }), null);
  assert.deepEqual(workspaceFocusRect({ elements: [], anchor: { x: 640, y: 400 }, width: 1280, height: 800 }), {
    left: 315, top: 205, width: 650, height: 390,
  });
  assert.match(css, /sketchizi-grid-spotlight::before\s*\{\s*inset: 0;/);
  assert.match(css, /\.sketchizi-grid-spotlight::after\s*\{[^}]*opacity: 0;/s);
  assert.match(css, /\.sketchizi-grid-spotlight\.has-focus::after\s*\{\s*opacity: 1;/);
});

test('rectangular fine grid expands around document content but stays inside the viewport', () => {
  const shape = { x: 500, y: 300, width: 100, height: 70 };
  const rect = workspaceFocusRect({ elements: [shape], width: 1280, height: 800 });
  assert.deepEqual(rect, { left: 225, top: 140, width: 650, height: 390 });
  const large = workspaceFocusRect({
    elements: [{ x: -100, y: -200, width: 3000, height: 2800 }],
    width: 1280, height: 800,
  });
  assert.ok(large.left >= 0 && large.top >= 0);
  assert.ok(large.left + large.width <= 1280 && large.top + large.height <= 800);
  assert.equal(large.width, Math.round(1280 * 0.88));
  assert.equal(large.height, Math.round(800 * 0.82));
  assert.equal(workspaceFocusRect({ elements: [shape], width: 0, height: 800 }), null);
});

test('selection overrides whole document bounds and pan/zoom move the focus rectangle', () => {
  const selected = { x: 100, y: 200, width: 80, height: 40 };
  const farAway = { x: 9000, y: 9000, width: 100, height: 100 };
  const rect = workspaceFocusRect({
    elements: [selected, farAway],
    selectedElements: [selected],
    state: { zoom: { value: 2 }, scrollX: -10, scrollY: 30 },
    width: 1200, height: 800,
  });
  assert.equal(rect.width, 650);
  assert.equal(rect.height, 390);
  assert.equal(rect.left, 0);
  assert.ok(rect.top >= 0);
  assert.deepEqual(spotlightElementCenter(selected, { zoom: 2, scrollX: -10, scrollY: 30 }), { x: 260, y: 500 });
  assert.deepEqual(spotlightCenter(undefined, undefined, 1000, 600), { x: 500, y: 300 });
});

test('rectangle scales down on mobile without overflowing the screen', () => {
  const r = workspaceFocusRect({ width: 390, height: 740, anchor: { x: 382, y: 680 } });
  assert.ok(r.left >= 0 && r.top >= 0);
  assert.ok(r.width <= 390 * 0.88 + 1);
  assert.ok(r.height <= 740 * 0.82 + 1);
  assert.ok(r.left + r.width <= 390);
  assert.ok(r.top + r.height <= 740);
});

test('coarse and fine grid patterns preserve world origin while panning and zooming', () => {
  assert.deepEqual(spotlightGridPattern({ gridSize: 20, zoom: 1, scrollX: -5, scrollY: 8 }), { spacing: 20, offsetX: 15, offsetY: 8 });
  assert.deepEqual(workspaceCoarseGridPattern({ gridSize: 20, zoom: 1, scrollX: -5, scrollY: 8 }), { spacing: 80, offsetX: 75, offsetY: 8 });
  assert.deepEqual(workspaceCoarseGridPattern({ gridSize: 20, zoom: 2, scrollX: 10, scrollY: -10 }), { spacing: 160, offsetX: 20, offsetY: 140 });
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: 0.1 }).spacing, 8);
  assert.equal(spotlightGridPattern({ gridSize: 20, zoom: 10 }).spacing, 72);
});

test('canvas tracks content and editing rather than hover and does not auto-hide after a timeout', () => {
  assert.match(canvas, /node\.classList\.toggle\("has-focus", !!focus\)/);
  assert.match(canvas, /elements: api\?\.getSceneElements\?\.\(\) \|\| savedSketch\?\.elements \|\| \[\]/);
  assert.match(canvas, /selectedElements: spotlightSelectedRef\.current/);
  assert.match(canvas, /drawingPointerRef\.current === null \|\| drawingPointerRef\.current !== event\.pointerId/);
  assert.match(canvas, /root\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(canvas, /root\.addEventListener\("pointermove", onPointerMove/);
  assert.match(canvas, /root\.addEventListener\("focusin", onTextFocus, true\)/);
  assert.match(canvas, /root\.addEventListener\("input", onTextInput, true\)/);
  assert.match(canvas, /root\.addEventListener\("drop", onDrop, true\)/);
  assert.doesNotMatch(canvas, /delayHide|clearHideTimer|setTimeout\([^)]*3200/s);
});

test('visual layers are rectangular, softly faded, and never intercept input', () => {
  assert.match(entry, /import "\.\/styles\/grid-spotlight\.css"/);
  assert.match(canvas, /layer\.className = "sketchizi-grid-spotlight"/);
  assert.match(canvas, /layer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(css, /pointer-events: none !important/);
  assert.match(css, /sketchizi-grid-spotlight::before/);
  assert.match(css, /sketchizi-grid-spotlight::after/);
  assert.match(css, /linear-gradient\(to right,/);
  assert.match(css, /linear-gradient\(to bottom,/);
  assert.match(css, /mask-composite: intersect/);
  assert.match(css, /-webkit-mask-composite: source-in/);
  assert.match(css, /--sk-grid-focus-width/);
  assert.match(css, /--sk-grid-focus-height/);
  assert.doesNotMatch(css, /clip-path:\s*circle|radial-gradient\(\s*ellipse/);
  assert.match(css, /\.app\.theme-dark \.desktop-canvas-region,\s*\.app\.theme-light \.desktop-canvas-region\s*\{[^}]*background-image: none !important;/s);
});

test('native Excalidraw grid snapping and document persistence remain untouched', () => {
  assert.match(canvas, /gridModeEnabled: savedSketch\?\.appState\?\.gridModeEnabled \?\? gridEnabled/);
  assert.doesNotMatch(canvas, /gridModeEnabled:\s*false/);
  assert.doesNotMatch(canvas, /\.updateScene\(\{\s*appState:\s*\{\s*gridModeEnabled:\s*false/s);
});

test('Show Grid OFF hides both layers and live toggle controls them immediately', () => {
  assert.match(canvas, /state\.gridModeEnabled \?\? savedSketch\?\.appState\?\.gridModeEnabled \?\? gridEnabled/);
  assert.match(canvas, /node\.classList\.toggle\("is-grid-enabled", !!showGrid\)/);
  assert.match(canvas, /if \(!showGrid\) \{\s*node\.classList\.remove\("has-focus"\);\s*return;/);
  assert.match(css, /\.sketchizi-grid-spotlight:not\(\.is-grid-enabled\)\s*\{\s*display: none;/);
  assert.match(canvas, /\[canvasRevision, selectedElements, paintWorkspaceGrid\]/);
  assert.match(canvas, /\[apiRef, savedSketch, gridEnabled\]/);
});
