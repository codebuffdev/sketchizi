import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas focus mode persists independently and is applied to the application shell", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /localStorage\.getItem\("sketchizi:canvas-focus-mode"\)/);
  assert.match(app, /localStorage\.setItem\("sketchizi:canvas-focus-mode", String\(canvasFocusMode\)\)/);
  assert.match(app, /canvasFocusMode \? "canvas-focus-mode" : ""/);
  assert.match(app, /canvasFocusMode=\{canvasFocusMode\}/);
  assert.match(app, /onToggleCanvasFocusMode=\{\(\) => setCanvasFocusMode/);
});

test("canvas focus mode has a keyboard shortcut that does not steal text input", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /event\.key\.toLowerCase\(\) !== "f"/);
  assert.match(app, /input, textarea, select, \[contenteditable='true'\]/);
  assert.match(app, /setCanvasFocusMode\(\(value\) => !value\)/);
});

test("header focus control remains accessible and restores the full header", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /desktop-app-focus-toggle/);
  assert.match(header, /Show application header/);
  assert.match(header, /Focus canvas and hide application header/);
  assert.match(header, /aria-expanded=\{!canvasFocusMode\}/);
});

test("focus mode removes the desktop header grid track and keeps a fixed restore control", async () => {
  const css = await read("../src/styles/responsive-desktop.css");
  assert.match(css, /\.app\.canvas-focus-mode\s*\{\s*grid-template-rows:\s*0 minmax\(0, 1fr\)/);
  assert.match(css, /\.desktop-app-header\.canvas-focus-mode\s*\{[\s\S]*?height:\s*0 !important/);
  assert.match(css, /\.desktop-app-header\.canvas-focus-mode > :not\(\.desktop-app-focus-toggle\)/);
  assert.match(css, /\.desktop-app-header\.canvas-focus-mode \.desktop-app-focus-toggle\s*\{[\s\S]*?position:\s*fixed !important/);
});
