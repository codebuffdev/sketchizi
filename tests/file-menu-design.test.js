import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CANVAS_BACKGROUND_COLORS, CANVAS_BACKGROUND_PATTERNS, normalizeHexColor } from "../src/features/navigation/canvasBackgroundOptions.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("background palette includes 16 named colors and nine patterns", () => {
  assert.equal(CANVAS_BACKGROUND_COLORS.length, 16);
  assert.equal(CANVAS_BACKGROUND_PATTERNS.length, 9);
  assert.deepEqual(CANVAS_BACKGROUND_PATTERNS.map((item) => item.id), [
    "solid", "grid", "dot-grid", "graph-paper", "horizontal", "vertical", "diagonal", "crosshatch", "isometric",
  ]);
});

test("custom hex colors normalize 3- and 6-digit hex and reject invalid values", () => {
  assert.equal(normalizeHexColor("#ABC"), "#aabbcc");
  assert.equal(normalizeHexColor("  7C3AED  "), "#7c3aed");
  assert.equal(normalizeHexColor("#12xz99"), null);
  assert.equal(normalizeHexColor("red"), null);
  assert.equal(normalizeHexColor(null), null);
});

test("File menu keeps recent lists collapsed and removes redundant title/section headers", async () => {
  const source = await read("../src/features/navigation/useNativeSketchiziMenu.js");
  assert.match(source, /<details class="sketchizi-menu-disclosure" data-recent-files-disclosure>/);
  assert.match(source, /<details class="sketchizi-menu-disclosure" data-recent-folders-disclosure>/);
  assert.match(source, /data-sketchizi-open-folder/);
  assert.match(source, /data-sketchizi-open-file/);
  assert.match(source, /data-sketchizi-new-file/);
  assert.doesNotMatch(source, /<div class="sketchizi-native-settings-title">File<\/div>/);
  assert.doesNotMatch(source, /CREATE \/ OPEN/);
});

test("Drop a Review preserves the existing repository URL and receives a Git branch icon", async () => {
  const source = await read("../src/features/navigation/useNativeSketchiziMenu.js");
  assert.match(source, /const REVIEW_URL = "https:\/\/github\.com\/codebuffdev"/);
  assert.match(source, /Drop a Review/);
  assert.match(source, /data-sketchizi-git-icon/);
});

test("canvas background picker supports theme, light, dark, patterns, and custom colors", async () => {
  const source = await read("../src/features/navigation/useNativeSketchiziMenu.js");
  const preferences = await read("../src/features/navigation/useSketchiziPreferences.js");
  const canvas = await read("../src/components/app/SketchiziCanvas.jsx");
  assert.match(source, /data-bg-mode="theme"/);
  assert.match(source, /data-bg-mode="light"/);
  assert.match(source, /data-bg-mode="dark"/);
  assert.match(source, /data-bg-color-picker/);
  assert.match(source, /data-bg-pattern/);
  assert.match(preferences, /applyCanvasBackgroundColor/);
  assert.match(preferences, /CANVAS_BACKGROUND_PATTERN_KEY/);
  assert.match(preferences, /CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY/);
  assert.match(canvas, /canvas-background-pattern-overlay/);
});
