import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas-first header overlays the workspace and has two independent islands", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const app = await read("../src/App.jsx");
  const css = await read("../src/styles/canvas-first-header.css");

  assert.match(app, /canvas-first-header/);
  assert.match(header, /desktop-app-header-island-left/);
  assert.match(header, /desktop-app-header-island-right/);
  assert.match(css, /\.app\.canvas-first-header \.desktop-app-header\s*\{[\s\S]*?position:\s*absolute !important/);
  assert.match(css, /grid-template-rows:\s*minmax\(0, 1fr\)/);
});

test("header hides on canvas pointer interaction without listening to canvas wheel gestures", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");

  assert.match(header, /collapseOnCanvasInteraction/);
  assert.match(header, /event\.target\.closest\("\.desktop-canvas-region"\)/);
  assert.match(header, /document\.addEventListener\("pointerdown", collapseOnCanvasInteraction, true\)/);
  assert.doesNotMatch(header, /addEventListener\(["']wheel["']/);
});

test("header supports pinning, top-edge reveal, and a keyboard visibility shortcut", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const css = await read("../src/styles/canvas-first-header.css");

  assert.match(header, /setHeaderPinned\(\(pinned\) => !pinned\)/);
  assert.match(header, /aria-pressed=\{headerPinned\}/);
  assert.match(header, /event\.clientY <= 20/);
  assert.match(header, /event\.key\.toLowerCase\(\) !== "h"/);
  assert.match(header, /desktop-app-header-reveal-handle/);
  assert.match(css, /desktop-app-header-reveal-handle\.is-visible/);
});

test("drawing dock stays bottom-centered regardless of header visibility", async () => {
  const responsive = await read("../src/styles/responsive.css");
  const responsiveFinal = await read("../src/styles/responsive-final.css");
  const canvasHeader = await read("../src/styles/canvas-first-header.css");

  assert.match(responsive, /top:\\s*auto !important;[\\s\\S]*bottom:\\s*calc\\(14px \\+ var\\(--safe-bottom, 0px\\)\\) !important;/);
  assert.match(responsiveFinal, /top:\\s*auto !important;[\\s\\S]*bottom:\\s*calc\\(14px \\+ var\\(--safe-bottom, 0px\\)\\) !important;/);
  assert.match(canvasHeader, /\\.app\\.canvas-first-header \\.App-toolbar-container\\s*\\{[\\s\\S]*top:\\s*auto !important;[\\s\\S]*bottom:\\s*calc\\(14px \\+ var\\(--safe-bottom, 0px\\)\\) !important;/);
  assert.doesNotMatch(canvasHeader, /desktop-app-header\\.is-hidden\\) \\.App-toolbar-container/);
});
