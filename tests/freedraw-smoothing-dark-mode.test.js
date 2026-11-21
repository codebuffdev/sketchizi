import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("live freedraw preview maps the stroke color through Excalidraw's dark-mode filter", async () => {
  const engine = await read("../src/features/canvas/freeDrawEngine.js");
  assert.match(engine, /applyDarkModeFilter/);
  assert.match(engine, /resolveFreeDrawPreviewColor\(appState\?\.currentItemStrokeColor, appState\?\.theme\)/);
  assert.doesNotMatch(engine, /context\.fillStyle = appState\?\.currentItemStrokeColor/);
});

test("Excalidraw receives the theme prop synced with the app theme", async () => {
  const canvas = await read("../src/components/app/SketchiziCanvas.jsx");
  assert.match(canvas, /theme=\{getCanvasAppearanceTheme\(activeAppearance, isDarkTheme\)\}/);
});

test("pen color swatches show the dark-mode rendered color", async () => {
  const dock = await read("../src/components/app/ToolOptionsDock.jsx");
  assert.match(dock, /displayColorForTheme\(color, appState\.theme\)/);
  assert.match(dock, /applyDarkModeFilter/);
});

test("preview and committed strokes share one smoothing profile", async () => {
  const engine = await read("../src/features/canvas/freeDrawEngine.js");
  assert.match(engine, /mouse: Object\.freeze\(\{ streamline: 0\.72, smoothing: 0\.78 \}\)/);
  const previewUses = engine.match(/smoothFreeDrawPoints\(session\.previewPoints, smoothing\)/g) || [];
  const commitUses = engine.match(/smoothFreeDrawPoints\(scenePoints, getFreeDrawSmoothingProfile\(pointerType\)\.smoothing\)/g) || [];
  assert.equal(previewUses.length, 1);
  assert.equal(commitUses.length, 1);
  assert.match(engine, /getFreeDrawSmoothingProfile\(session\.pointerType\)/);
  assert.match(engine, /streamline: getAdjustedFreeDrawStreamline\(pointerType\)/);
});
