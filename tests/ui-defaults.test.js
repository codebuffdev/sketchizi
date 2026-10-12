import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getInitialThemeMode, THEME_PREFERENCE_KEY } from "../src/features/navigation/themePreference.js";

function storageWith(value) {
  return { getItem: (key) => key === THEME_PREFERENCE_KEY ? value : null };
}

test("missing, invalid, or unavailable theme preference defaults to dark", () => {
  assert.equal(getInitialThemeMode(storageWith(null)), "dark");
  assert.equal(getInitialThemeMode(storageWith("sepia")), "dark");
  assert.equal(getInitialThemeMode({ getItem() { throw new Error("blocked"); } }), "dark");
});

test("only saved light and dark preferences are accepted", () => {
  assert.equal(getInitialThemeMode(storageWith("light")), "light");
  assert.equal(getInitialThemeMode(storageWith("dark")), "dark");
  assert.equal(getInitialThemeMode(storageWith("system")), "dark");
});

test("the hamburger menu constrains and owns its vertical scroll region", async () => {
  const css = await readFile(new URL("../src/styles/responsive-touch.css", import.meta.url), "utf8");
  const menuRule = css.match(/\.dropdown-menu > \.dropdown-menu-container,\s*\.dropdown-menu-container\s*\{([^}]*)\}/);
  assert.ok(menuRule, "native menu and independently mounted dropdown containers have scroll rules");
  assert.match(menuRule[1], /max-height:\s*calc\(100dvh/);
  assert.match(menuRule[1], /overflow-y:\s*auto\s*!important/);
  assert.match(menuRule[1], /min-height:\s*0/);
  assert.match(menuRule[1], /overscroll-behavior-y:\s*contain/);
  const menuHook = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(menuHook, /getBoundingClientRect\(\)\.top/);
  assert.match(menuHook, /window\.innerHeight - top - bottomGap/);
  assert.match(menuHook, /setProperty\("max-height", `\$\{availableHeight\}px`, "important"\)/);
  assert.match(menuHook, /visualViewport\?\.addEventListener\("resize", scheduleCleanup\)/);
  assert.doesNotMatch(css, /\.excalidraw \.dropdown-menu-container/,
    "scroll handling must not depend on the menu being nested under .excalidraw");
});


test("canvas always follows the global two-theme preference and reconciles after Excalidraw updates", async () => {
  const source = await readFile(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
  assert.match(source, /const isDarkTheme = themeMode === "dark"/);
  assert.match(source, /applyCanvasThemeBackground\(apiRef\.current, isDarkTheme\)/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) =>/);
  assert.doesNotMatch(source, /themeMode === "system"/);
  assert.doesNotMatch(source, /canvasBackgroundMode/);
});

test("independent canvas palette is removed in the two-theme design", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /Remove Excalidraw's[\s\S]*independent canvas-background palette/);
  assert.match(source, /canvasBackgroundLabel\.closest/);
});

test("restored scene background cannot override Day/Night during initialData hydration", async () => {
  const source = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
  assert.match(source, /viewBackgroundColor: getCanvasBackground\(isDarkTheme\)/);
  const helper = await readFile(new URL("../src/features/navigation/canvasTheme.js", import.meta.url), "utf8");
  assert.match(helper, /api\.getAppState\(\)/);
  assert.match(helper, /api\.updateScene\(/);
  assert.match(helper, /CaptureUpdateAction\.NEVER/);
});

test("hamburger menu keeps file management at the top without duplicate header controls", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /customBlock\.append\(recentSection\)/);
  assert.match(source, /menuParent\.insertBefore\(customBlock, menuParent\.firstChild\)/);
  assert.doesNotMatch(source, /data-sketchizi-collaborate/);
  assert.doesNotMatch(source, /data-sketchizi-architecture-validation/);
  assert.doesNotMatch(source, /data-diagramly-theme-menu/);
});


test("hamburger removes duplicate Help and labels the file action Open file", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /toLowerCase\(\) === "help"/);
  assert.match(source, /replaceExactTextNode\(item, "Open", "Open file"\)/);
  assert.match(source, /openDrawingFromDisk/);
});

test("canvas follows light/dark themes, menu supports pinning, and Open file has an icon", async () => {
  const source = await readFile(new URL("../src/features/navigation/canvasTheme.js", import.meta.url), "utf8");
  assert.match(source, /const LIGHT_CANVAS_BACKGROUND = "#ffffff"/);
  assert.match(source, /const DARK_CANVAS_BACKGROUND = "#f3faff"/);
  assert.match(source, /invert\(93%\) hue-rotate\(180deg\)/);
  assert.match(source, /isDarkTheme/);
  const menuSource = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(menuSource, /data-sketchizi-menu-pin/);
  assert.match(menuSource, /sketchizi-menu-pinned/);
  assert.match(menuSource, /sketchizi-native-open-file-icon/);
  assert.doesNotMatch(menuSource, /data-sketchizi-theme-background-default/);
  const css = await readFile(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-sketchizi-theme="dark"\].*button:hover/);
  assert.match(css, /color: #ffffff !important/);
  const worker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.match(worker, /Always fetch document navigations from Cloudflare first/);
});


test("canvas swatches are disabled so only the global Day/Night theme controls the canvas", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /Canvas color swatches are intentionally disabled/);
  assert.match(source, /const applyCanvasSwatch = \(\) => \{\}/);
});


test("menu pin control is icon-only and keeps an accessible pressed state", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /pin\.innerHTML = '<svg class="sketchizi-menu-pin-icon"/);
  assert.match(source, /pin\.setAttribute\("aria-label", initiallyPinned \? "Unpin menu panel" : "Pin menu panel"\)/);
  assert.doesNotMatch(source, /pin\.querySelector\("span:last-child"\)\.textContent/);
  assert.match(source, /sketchizi:menu-explicit-close/);
  assert.match(source, /if \(localStorage\.getItem\("sketchizi-menu-pinned"\) !== "true"\) return;/);
  const css = await readFile(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
  assert.match(css, /\.sketchizi-menu-pin-icon/);
  assert.match(css, /width: 30px/);
});
