import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAP_WORLD_PAD,
  clampCenterToWorld,
  computeRadarTransform,
  fitToContent,
  getContentBounds,
  getViewportRect,
  parseColor,
  pointInRect,
  radarFill,
  radarStroke,
  radarToWorld,
  scrollForCenter,
  worldToRadar,
} from "../src/features/canvas/mapRadar.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles/map-dock.css");
const dock = read("../src/components/app/MapDock.jsx");
const radar = read("../src/components/app/CanvasMapRadar.jsx");
const zenHud = read("../src/components/app/ZenHud.jsx");
const app = read("../src/App.jsx");

const rect = (id, x, y, width, height, extra = {}) => ({ id, type: "rectangle", x, y, width, height, ...extra });
const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} !~ ${expected}`);

// ---- geometry ---------------------------------------------------------------

test("content bounds ignore deleted elements and follow linear points", () => {
  const bounds = getContentBounds([
    rect("a", 0, 0, 100, 50),
    rect("gone", 5000, 5000, 10, 10, { isDeleted: true }),
    // An arrow anchored at its first point that runs up and to the left.
    { id: "ar", type: "arrow", x: 300, y: 200, width: 120, height: 80, points: [[0, 0], [-120, -80]] },
  ]);
  assert.deepEqual({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }, { minX: 0, minY: 0, maxX: 300, maxY: 200 });
  assert.equal(bounds.count, 2);
  assert.equal(getContentBounds([]), null);
});

test("camera lens is viewportSize / zoom in world units", () => {
  const vp = getViewportRect({ scrollX: -400, scrollY: -100, zoom: { value: 0.8 }, width: 1600, height: 900 });
  assert.deepEqual({ x: vp.x, y: vp.y, w: vp.w, h: vp.h }, { x: 400, y: 100, w: 2000, h: 1125 });
});

test("radar world is union(content, viewport) padded by 15% and fitted inside the canvas", () => {
  const content = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
  const viewport = { x: 2000, y: 100, w: 400, h: 300 }; // lens far to the right of the content
  const tf = computeRadarTransform({ content, viewport, width: 228, height: 124 });
  // union is x 0..2400, y 0..500 -> padded by 15% of each span.
  near(tf.world.minX, -2400 * MAP_WORLD_PAD);
  near(tf.world.maxX, 2400 * (1 + MAP_WORLD_PAD));
  near(tf.world.minY, -500 * MAP_WORLD_PAD);
  near(tf.world.maxY, 500 * (1 + MAP_WORLD_PAD));
  // Contained and centred.
  const tl = worldToRadar(tf, tf.world.minX, tf.world.minY);
  const br = worldToRadar(tf, tf.world.maxX, tf.world.maxY);
  assert.ok(tl.x >= -1e-9 && tl.y >= -1e-9 && br.x <= 228 + 1e-9 && br.y <= 124 + 1e-9);
  near(tl.x, 228 - br.x);
  near(tl.y, 124 - br.y);
  // The lens is on the radar.
  const lens = worldToRadar(tf, viewport.x + viewport.w, viewport.y + viewport.h);
  assert.ok(lens.x <= 228 && lens.y <= 124);
});

test("empty canvas still produces a usable transform around the viewport", () => {
  const tf = computeRadarTransform({ content: null, viewport: { x: 0, y: 0, w: 1280, h: 720 }, width: 228, height: 124 });
  assert.ok(Number.isFinite(tf.scale) && tf.scale > 0);
});

test("radar <-> world mapping round-trips", () => {
  const tf = computeRadarTransform({
    content: { minX: -300, minY: -120, maxX: 900, maxY: 640 },
    viewport: { x: 50, y: 20, w: 800, h: 450 },
    width: 228,
    height: 124,
  });
  for (const [x, y] of [[-300, -120], [0, 0], [412.5, 77.25], [900, 640]]) {
    const p = worldToRadar(tf, x, y);
    const w = radarToWorld(tf, p.x, p.y);
    near(w.x, x, 1e-7);
    near(w.y, y, 1e-7);
  }
});

test("dragging the lens maps 1:1 - N radar px moves the camera N / scale world units", () => {
  const tf = computeRadarTransform({
    content: { minX: 0, minY: 0, maxX: 3000, maxY: 1800 },
    viewport: { x: 100, y: 100, w: 1200, h: 700 },
    width: 228,
    height: 124,
  });
  const start = radarToWorld(tf, 60, 40);
  const moved = radarToWorld(tf, 60 + 25, 40 - 10);
  near(moved.x - start.x, 25 / tf.scale, 1e-7);
  near(moved.y - start.y, -10 / tf.scale, 1e-7);
});

test("scrollForCenter centres the camera on the requested world point", () => {
  const view = { w: 1600 / 0.8, h: 900 / 0.8 };
  const { scrollX, scrollY } = scrollForCenter(500, -250, view.w, view.h);
  const vp = getViewportRect({ scrollX, scrollY, zoom: { value: 0.8 }, width: 1600, height: 900 });
  near(vp.x + vp.w / 2, 500);
  near(vp.y + vp.h / 2, -250);
});

test("lens centre is clamped to the padded world", () => {
  const tf = computeRadarTransform({
    content: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    viewport: { x: 0, y: 0, w: 500, h: 500 },
    width: 228,
    height: 124,
  });
  const c = clampCenterToWorld(tf, 1e9, -1e9);
  assert.equal(c.x, tf.world.maxX);
  assert.equal(c.y, tf.world.minY);
  assert.ok(pointInRect(5, 5, { x: 0, y: 0, w: 10, h: 10 }));
  assert.ok(!pointInRect(11, 5, { x: 0, y: 0, w: 10, h: 10 }));
});

// ---- colour -----------------------------------------------------------------

test("silhouette tints stay visible in both themes", () => {
  assert.equal(parseColor("transparent"), null);
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30 });
  // Excalidraw's default near-black stroke would vanish on the dark radar.
  assert.notEqual(radarStroke("#1e1e1e", true), "rgb(30, 30, 30)");
  // ...and a white stroke would vanish on the light radar.
  assert.notEqual(radarStroke("#ffffff", false), "rgb(255, 255, 255)");
  // Real colours pass through untouched.
  assert.equal(radarStroke("#e03131", false), "rgb(224, 49, 49)");
  assert.equal(radarFill("transparent", true), null);
  assert.equal(radarFill("#a5d8ff", false), "rgb(165, 216, 255)");
});

// ---- fit --------------------------------------------------------------------

test("Fit is a no-op on an empty canvas and delegates to the viewport API otherwise", () => {
  const calls = [];
  const emptyApi = { getSceneElements: () => [rect("x", 0, 0, 1, 1, { isDeleted: true })], setViewport: (o) => calls.push(o) };
  assert.equal(fitToContent(emptyApi), false);
  assert.equal(calls.length, 0);
  const el = rect("y", 0, 0, 10, 10);
  const api = { getSceneElements: () => [el], setViewport: (o) => calls.push(o) };
  assert.equal(fitToContent(api), true);
  assert.deepEqual(calls, [{ target: [el], fit: "contain" }]);
  assert.equal(fitToContent(null), false);
});

// ---- layout / behaviour contracts ------------------------------------------------

test("dock: Map sits left of Zen in the bottom-right corner with an 8px gap", () => {
  assert.match(css, /\.app \.sk-hud-dock \{[^}]*right: calc\(20px \+ var\(--safe-right, 0px\)\);[^}]*bottom: calc\(20px \+ var\(--safe-bottom, 0px\)\);[^}]*gap: 8px;/s);
  const mapAt = zenHud.indexOf("<MapDock");
  const zenAt = zenHud.indexOf('className={`sk-zen-pill');
  assert.ok(mapAt > -1 && zenAt > mapAt, "Map renders before (left of) Zen");
  assert.match(zenHud, /!isZenMode && mapProps && <MapDock/);
});

test("popover: 230x154, anchored 12px above the pill, glass surface in both themes", () => {
  assert.match(css, /\.sk-map-popover \{[^}]*bottom: calc\(100% \+ 12px\);[^}]*width: 230px;[^}]*height: 154px;/s);
  assert.match(css, /\.sk-map-popover \{[^}]*right: 0;/s);
  assert.match(css, /border-radius: 14px;/);
  assert.match(css, /backdrop-filter: blur\(14px\)/);
  assert.match(css, /border: 1px solid var\(--map-border\)/);
  assert.match(css, /rgba\(24, 27, 32, 0\.88\)/);
  assert.match(css, /rgba\(255, 255, 255, 0\.92\)/);
});

test("hover wrapper is position:relative with a 14px ::after bridge and a 200ms grace timer", () => {
  assert.match(css, /\.app \.sk-map-wrap \{[^}]*position: relative;/s);
  assert.match(css, /\.sk-map-wrap\.is-open::after \{[^}]*height: 14px;/s);
  assert.match(dock, /MAP_LEAVE_GRACE_MS = 200/);
  assert.match(dock, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(dock, /onPointerLeave=\{handlePointerLeave\}/);
  // The popover is rendered inside the same wrapper as the button.
  assert.ok(dock.indexOf('className={`sk-map-wrap') < dock.indexOf("sk-map-pill") && dock.indexOf("sk-map-pill") < dock.indexOf("sk-map-popover"));
});

test("hover opens, click pins (violet indicator), Esc closes and unpins from either state", () => {
  assert.match(dock, /const open = pinned \|\| hovering;/);
  assert.match(dock, /onClick=\{onTogglePinned\}/);
  assert.match(dock, /aria-pressed=\{pinned\}/);
  assert.match(css, /\.sk-map-pill\.is-pinned \{[^}]*border-color: var\(--map-violet\)/s);
  assert.match(css, /--map-violet: #8B5CF6/);
  assert.match(dock, /event\.key === "Escape"/);
  assert.match(dock, /window\.addEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(radar, /className="sk-map-esc"/);
  assert.match(radar, /onClick=\{onClose\}/);
});

test("touch input never hover-opens the popover", () => {
  assert.match(dock, /event\.pointerType === "touch"\) return;/);
});

test("Zen Mode hides Map and unpins it", () => {
  assert.match(app, /if \(isZenMode && minimapOpen\) setMinimapOpen\(false\);/);
});

test("radar: DPR-scaled canvas, violet 1.5px lens, pointer-captured drag, header readouts", () => {
  assert.match(radar, /window\.devicePixelRatio/);
  assert.match(radar, /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/);
  assert.match(radar, /ctx\.lineWidth = 1\.5/);
  assert.match(radar, /rgba\(139, 92, 246, 0\.14\)/);
  assert.match(radar, /setPointerCapture/);
  assert.match(radar, /captureUpdate: CaptureUpdateAction\.NEVER/);
  assert.match(radar, /sk-map-zoom/);
  assert.match(radar, /sk-map-fit/);
});

test("the old fixed-position minimap is gone", () => {
  assert.doesNotMatch(app, /useMinimapController|minimapScene|centerOnMinimap/);
  assert.doesNotMatch(read("../src/components/app/SketchiziCanvas.jsx"), /<Minimap /);
});
