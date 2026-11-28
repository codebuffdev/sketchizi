import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_PADDING, MIN_THUMB_PX, clampScroll, computeAxis, computeContentBounds, computeScrollState, elementBounds, scrollForProgress, thumbLength,
} from "../src/features/canvas/scrollbarModel.js";

const box = (x, y, width, height, extra = {}) => ({ id: `${x}-${y}`, type: "rectangle", x, y, width, height, ...extra });
const view = { width: 1000, height: 800 };
const state = (elements, appState = {}) => computeScrollState({ elements, appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 }, ...appState }, ...view });

test("contentBounds covers all visible elements plus a 120px world-space margin", () => {
  assert.equal(CONTENT_PADDING, 120);
  const b = computeContentBounds([box(100, 200, 50, 60), box(-300, 500, 20, 20), box(900, -40, 10, 10)]);
  assert.deepEqual(b, { minX: -420, minY: -160, maxX: 1030, maxY: 640 });
});

test("deleted elements are ignored; a canvas of only deleted elements counts as empty", () => {
  assert.equal(computeContentBounds([]), null);
  assert.equal(computeContentBounds(null), null);
  assert.equal(computeContentBounds([box(0, 0, 10, 10, { isDeleted: true })]), null);
  assert.deepEqual(computeContentBounds([box(0, 0, 10, 10), box(5000, 5000, 10, 10, { isDeleted: true })]), { minX: -120, minY: -120, maxX: 130, maxY: 130 });
});

test("rotated elements contribute their rotated extent", () => {
  const b = elementBounds(box(0, 0, 100, 10, { angle: Math.PI / 2 }));
  assert.ok(Math.abs(b.maxY - b.minY - 100) < 1e-6);
  assert.ok(Math.abs(b.maxX - b.minX - 10) < 1e-6);
});

test("empty canvas: both scrollbars hidden (never a 50% bar on a blank canvas)", () => {
  const s = state([]);
  for (const axis of [s.vertical, s.horizontal]) { assert.equal(axis.enabled, false); assert.equal(axis.reason, "empty"); }
  assert.equal(state([box(0, 0, 10, 10, { isDeleted: true })]).vertical.enabled, false);
});

test("content that fits the viewport hides the scrollbar on that axis only", () => {
  // 600 x 2000 world content (plus padding) at zoom 1 in a 1000 x 800 viewport.
  const s = state([box(0, 0, 400, 1800)]);
  assert.equal(s.horizontal.enabled, false);
  assert.equal(s.horizontal.reason, "fits");
  assert.equal(s.vertical.enabled, true);
});

test("fit is judged at the current zoom", () => {
  const els = [box(0, 0, 400, 1800)];
  assert.equal(state(els, { zoom: { value: 1 } }).vertical.enabled, true);
  assert.equal(state(els, { zoom: { value: 0.3 } }).vertical.enabled, false); // 2040 * 0.3 = 612 < 800
  assert.equal(state(els, { zoom: { value: 2 } }).horizontal.enabled, true); // 640 * 2 = 1280 > 1000
});

test("exactly-fitting content is hidden; one pixel over is shown", () => {
  const fits = computeAxis({ min: 0, max: 800, scroll: 0, viewportPx: 800, zoom: 1 });
  assert.equal(fits.enabled, false);
  assert.equal(computeAxis({ min: 0, max: 802, scroll: 0, viewportPx: 800, zoom: 1 }).enabled, true);
});

test("scroll range is strictly the drawn bounds: track 0% = top of artwork, 100% = bottom edge reaches viewport bottom", () => {
  const a = computeAxis({ min: -120, max: 2120, scroll: 0, viewportPx: 800, zoom: 1 });
  assert.equal(a.scrollMin, -120);
  assert.equal(a.scrollMax, 2120 - 800);
  assert.equal(scrollForProgress(a, 0), -120);
  assert.equal(scrollForProgress(a, 1), 1320);
  assert.equal(scrollForProgress(a, 2), 1320, "progress is clamped");
  assert.equal(scrollForProgress(a, -1), -120);
  // Camera top sits at scroll 0 -> progress = 120 / 1440.
  assert.ok(Math.abs(a.progress - 120 / 1440) < 1e-9);
});

test("dragging and wheel-panning can never leave the artwork", () => {
  const a = computeAxis({ min: -120, max: 2120, scroll: 0, viewportPx: 800, zoom: 1 });
  assert.equal(clampScroll(a, -99999), -120);
  assert.equal(clampScroll(a, 99999), 1320);
  assert.equal(clampScroll(a, 500), 500);
  assert.equal(clampScroll({ enabled: false }, 99999), 99999, "disabled axis is left to native pan");
});

test("progress clamps when the camera sits outside the drawn bounds", () => {
  assert.equal(computeAxis({ min: 0, max: 3000, scroll: 5000, viewportPx: 800, zoom: 1 }).progress, 0); // camera far above content
  assert.equal(computeAxis({ min: 0, max: 3000, scroll: -9000, viewportPx: 800, zoom: 1 }).progress, 1);
});

test("zoom scales the scrollable world range (viewport covers fewer world units when zoomed in)", () => {
  const a = computeAxis({ min: 0, max: 3000, scroll: 0, viewportPx: 800, zoom: 2 });
  assert.equal(a.viewportWorld, 400);
  assert.equal(a.scrollMax, 2600);
});

test("thumb length is proportional to the visible share, floored at 36px and capped at the track", () => {
  assert.equal(MIN_THUMB_PX, 36);
  const half = computeAxis({ min: 0, max: 1600, scroll: 0, viewportPx: 800, zoom: 1 });
  assert.equal(thumbLength(half, 600), 300);
  const huge = computeAxis({ min: 0, max: 400000, scroll: 0, viewportPx: 800, zoom: 1 });
  assert.equal(thumbLength(huge, 600), 36);
  assert.equal(thumbLength(half, 20), 20);
});

test("vertical and horizontal axes are computed independently from scrollY / scrollX", () => {
  const els = [box(0, 0, 3000, 3000)];
  const s = state(els, { scrollX: -500, scrollY: -1500 });
  assert.equal(s.horizontal.top, 500);
  assert.equal(s.vertical.top, 1500);
  assert.ok(s.horizontal.enabled && s.vertical.enabled);
});
