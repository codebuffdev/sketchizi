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
  assert.match(header, /setHeaderVisible\(false\)/);
  // Document title and sign-in no longer auto-hide independently of the rail.
  assert.doesNotMatch(header, /setDocumentTitleVisible|setAuthControlVisible/);
  assert.match(header, /document\.addEventListener\("pointerdown", collapseOnCanvasInteraction, true\)/);
  assert.doesNotMatch(header, /addEventListener\(["']wheel["']/);
});

test("header supports pinning, settings-only reveal, and a keyboard visibility shortcut", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const css = await read("../src/styles/canvas-first-header.css");
  const railCss = await read("../src/styles/right-header-rail.css");

  assert.match(header, /setHeaderPinned\(\(pinned\) => !pinned\)/);
  assert.match(header, /aria-pressed=\{headerPinned\}/);
  // The rail is revealed only from the settings popover or the keyboard shortcut;
  // hovering the screen edges must not open it.
  assert.doesNotMatch(header, /event\.clientY <= 24|event\.clientX >= viewportWidth - 100/);
  assert.match(header, /window\.matchMedia\("\(min-width: 521px\)"\)\.matches/);
  assert.match(header, /event\.key\.toLowerCase\(\) !== "h"/);
  assert.match(header, /desktop-app-header-reveal-handle/);
  assert.match(header, /M4 6h16M4 12h16M4 18h16/);
  assert.match(header, /setHeaderVisible\(true\)/);
  assert.match(header, /setHeaderVisible\(\(visible\) => !visible\)/);
  assert.match(header, /revealPointerEnteredFromCollapsedRef/);
  assert.ok(railCss.includes("top: var(--header-top, calc(18px + var(--safe-top, 0px)));"));
  assert.ok(railCss.includes("width: var(--header-top-control-height, 40px);"));
  assert.ok(railCss.includes("height: var(--header-top-control-height, 40px);"));
  assert.ok(railCss.includes("transform: none !important;"));
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
  assert.doesNotMatch(css, /\.sketchizi-layers-panel/);
  assert.match(app, /\{renderedRightRailPanel === "properties" && \(/);
  assert.doesNotMatch(app, /ArchitectureValidationPanel/);
});


test("Canvas patterns menu contains only grid patterns, not appearance presets", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const styles = await read("../src/styles/canvas-style-patterns.css");
  const patternsStart = header.indexOf('aria-label="Canvas patterns"');
  assert.notEqual(patternsStart, -1);
  const menuContent = header.slice(Math.max(0, patternsStart - 500), patternsStart + 2200);
  assert.match(menuContent, /Canvas patterns/);
  assert.match(menuContent, /CANVAS_PATTERN_OPTIONS/);
  assert.match(header, /"Focus Grid"/);
  assert.match(header, /"Dot Grid"/);
  assert.match(header, /"Local Focus"/);
  assert.doesNotMatch(header + menuContent, /Appearance preset|Chalkboard|Hand-drawn, expressive strokes/);
  assert.match(styles, /\.app\.theme-light \.sketchizi-header-grid-popover/);
  assert.match(styles, /\.app\.theme-dark \.sketchizi-header-grid-popover/);
  assert.match(styles, /color-scheme: light/);
  assert.match(styles, /color-scheme: dark/);
});

test("Canvas Style popover shows selectable view cards, inline snap toggle and no footer info line", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const styles = await read("../src/styles/canvas-style-patterns.css");
  assert.match(header, /Freeform boundless space/);
  assert.match(header, /Fixed, named page frames/);
  assert.match(header, /canvasMode === value/);
  assert.match(header, /Snap to grid/);
  assert.match(header, /Browse templates/);
  assert.doesNotMatch(header, /Grid displays a uniform pattern across the canvas/);
  assert.match(styles, /width: min\(348px/);
  assert.match(styles, /grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /transform-origin: top right/);
  assert.match(styles, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /cubic-bezier\(0\.4, 0, 1, 1\)/);
});
