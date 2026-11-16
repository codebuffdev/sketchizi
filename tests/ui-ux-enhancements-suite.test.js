import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const toolbar = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
const indicator = await readFile(new URL("../src/components/app/TextSizeIndicator.jsx", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const authCss = await readFile(new URL("../src/styles/auth.css", import.meta.url), "utf8");
const dockCss = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("Suggestion 1: Font size buttons display both label and pixel sub-labels with direct number stepper", () => {
  assert.match(toolbar, /format-font-size-grid/);
  assert.match(toolbar, /format-size-name/);
  assert.match(toolbar, /format-size-sub/);
  assert.match(toolbar, /format-size-input-wrapper/);
  assert.match(toolbar, /format-size-input-val/);
  assert.match(toolbar, /applyFormatting\(\{\s*fontSize:\s*val\s*\}\)/);
  assert.match(dockCss, /\.app \.contextual-formatting-toolbar \.format-size-input-val/);
});

test("Suggestion 2: TextSizeIndicator displays dimensions for selected shapes and font size for text", () => {
  assert.match(indicator, /el\.type === "text"/);
  assert.match(indicator, /fontSize: Math\.round\(fontSize\)/);
  assert.match(indicator, /\{ind\.fontSize\}px/);
  assert.match(indicator, /className="sketchizi-text-size-indicator"/);
});

test("Suggestion 3: Auth status indicator is styled as a refined, non-intrusive status badge", () => {
  assert.match(authCss, /\.auth-inline-error/);
  assert.match(authCss, /border-radius:\s*9999px/);
  assert.match(authCss, /rgba\(245,\s*158,\s*11/);
});

test("Suggestion 4: Dock tooltips parse shortcuts and render physical kbd badges", () => {
  assert.match(canvas, /sketchizi-dock-kbd/);
  assert.match(canvas, /toolbarTooltip\.innerHTML/);
  assert.match(dockCss, /\.sketchizi-dock-kbd/);
  assert.match(dockCss, /border-bottom:\s*2px solid/);
});

test("Suggestion 5: Opacity controls feature 25%, 50%, 75%, 100% quick presets and live percentage label", () => {
  assert.match(toolbar, /OPACITY_PRESETS = \[25, 50, 75, 100\]/);
  assert.match(toolbar, /format-opacity-presets-row/);
  assert.match(toolbar, /format-opacity-preset-btn/);
  assert.match(toolbar, /Opacity \(\{currentOpacity\}%\)/);
  assert.match(dockCss, /\.format-opacity-preset-btn/);
});

test("Suggestion 6: Contextual dock exposes alignment and distribution for multi-element selections", () => {
  assert.match(toolbar, /id: "align", label: "Align", icon: "⫽"/);
  assert.match(toolbar, /if \(group\.id === "align"\)/);
  assert.match(toolbar, /liveSelection\.length >= 2/);
  assert.match(toolbar, /const alignSelection = \(alignment\) =>/);
  assert.match(toolbar, /alignSelection\("left"\)/);
  assert.match(toolbar, /alignSelection\("centerHorizontal"\)/);
  assert.match(toolbar, /alignSelection\("right"\)/);
  assert.match(toolbar, /alignSelection\("top"\)/);
  assert.match(toolbar, /alignSelection\("centerVertical"\)/);
  assert.match(toolbar, /alignSelection\("bottom"\)/);
  assert.match(toolbar, /alignSelection\("distributeHorizontal"\)/);
  assert.match(toolbar, /alignSelection\("distributeVertical"\)/);
  assert.match(dockCss, /\.format-alignment-section/);
});
