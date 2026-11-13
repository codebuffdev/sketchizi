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
  const bottomAnchor = "bottom: calc(14px + var(--safe-bottom, 0px)) !important;";

  assert.ok(responsive.includes("top: auto !important;"));
  assert.ok(responsive.includes(bottomAnchor));
  assert.ok(responsiveFinal.includes("top: auto !important;"));
  assert.ok(responsiveFinal.includes(bottomAnchor));
  assert.ok(canvasHeader.includes(".app.canvas-first-header .App-toolbar-container"));
  assert.ok(canvasHeader.includes(bottomAnchor));
  assert.equal(canvasHeader.includes("desktop-app-header.is-hidden) .App-toolbar-container"), false);
});


test("Properties and Validation controls remain clear of the floating header", async () => {
  const css = await read("../src/styles/canvas-first-header.css");
  const app = await read("../src/App.jsx");

  assert.match(css, /\.app\.canvas-first-header:has\(\.desktop-app-header:not\(\.is-hidden\)\)/);
  assert.match(css, /\.desktop-context-region \.desktop-validation-host/);
  assert.match(css, /padding-top: calc\(68px \+ var\(--safe-top, 0px\)\)/);
  assert.match(css, /\.architecture-validation-panel/);
  assert.match(css, /top: calc\(108px \+ var\(--safe-top, 0px\)\)/);
  assert.doesNotMatch(css, /\.sketchizi-layers-panel/);
  assert.match(app, /\{propertiesOpen && \(/);
  assert.match(app, /\{architectureValidationOpen && \(/);
});
