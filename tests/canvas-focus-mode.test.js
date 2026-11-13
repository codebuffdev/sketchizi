import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas wheel direction automatically hides and reveals the application header", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /const \[canvasHeaderHidden, setCanvasHeaderHidden\] = useState\(false\)/);
  assert.match(app, /canvasRegion\.addEventListener\("wheel", handleCanvasWheel, \{ passive: true \}\)/);
  assert.match(app, /event\.deltaY > 8\) setCanvasHeaderHidden\(true\)/);
  assert.match(app, /event\.deltaY < -8\) setCanvasHeaderHidden\(false\)/);
  assert.match(app, /canvas-header-hidden/);
});

test("canvas wheel listener leaves native zoom and pan behaviour untouched", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /passive: true/);
  assert.doesNotMatch(app, /handleCanvasWheel[\s\S]{0,300}preventDefault/);
});

test("header restore control is accessible and remains available while hidden", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /desktop-app-focus-toggle/);
  assert.match(header, /Show application header/);
  assert.match(header, /aria-expanded=\{!canvasHeaderHidden\}/);
  assert.match(header, /onClick=\{onToggleCanvasHeader\}/);
});

test("hidden header releases its grid track and keeps a fixed restore control", async () => {
  const css = await read("../src/styles/responsive-desktop.css");
  assert.match(css, /\.app\.canvas-header-hidden\s*\{\s*grid-template-rows:\s*0 minmax\(0, 1fr\)/);
  assert.match(css, /\.desktop-app-header\.canvas-header-hidden\s*\{[\s\S]*?height:\s*0 !important/);
  assert.match(css, /\.desktop-app-header\.canvas-header-hidden > :not\(\.desktop-app-focus-toggle\)/);
  assert.match(css, /\.desktop-app-header\.canvas-header-hidden \.desktop-app-focus-toggle\s*\{[\s\S]*?position:\s*fixed !important/);
});
