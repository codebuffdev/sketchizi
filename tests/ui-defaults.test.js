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

test("valid saved light, dark, and system preferences are preserved", () => {
  assert.equal(getInitialThemeMode(storageWith("light")), "light");
  assert.equal(getInitialThemeMode(storageWith("dark")), "dark");
  assert.equal(getInitialThemeMode(storageWith("system")), "system");
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


test("canvas background mode is explicit and preserves legacy saved-scene colors", async () => {
  const { resolveCanvasBackgroundMode } = await import("../src/features/navigation/canvasBackgroundMode.js");
  assert.equal(resolveCanvasBackgroundMode("theme", true), "theme");
  assert.equal(resolveCanvasBackgroundMode("custom", false), "custom");
  assert.equal(resolveCanvasBackgroundMode(null, true), "custom");
  assert.equal(resolveCanvasBackgroundMode(null, false), "theme");
});

test("canvas theme synchronization migrates legacy default-gray scenes but preserves chosen custom colors", async () => {
  const source = await readFile(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
  assert.match(source, /canvasBackgroundMode !== "theme"/);
  assert.match(source, /legacyDefaultBackgrounds = new Set\(\[LIGHT_CANVAS_BACKGROUND, "#fff", "#dedede", "#dcdcdc", "#e0e0e0"\]\)/);
  assert.match(source, /setCanvasBackgroundMode\("theme"\)/);
  assert.match(source, /viewBackgroundColor: nextBackground/);
  assert.match(source, /\[apiRef, apiReady, canvasBackgroundMode, isDarkTheme, savedSketch, sketchReady\]/);
  assert.match(source, /if \(canvasBackgroundMode !== "theme" && !isLegacyDefault\) return/);
});

test("native Canvas background palette has an explicit automatic-mode action", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /data-sketchizi-theme-background-default/);
  assert.match(source, /Use theme default/);
  assert.match(source, /markCanvasBackgroundCustom\(\)/);
});


test("Use theme default immediately applies the effective theme background to the canvas", async () => {
  const source = await readFile(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
  assert.match(source, /const useThemeDefaultBackground = useCallback\(\(\) =>/);
  assert.match(source, /setCanvasBackgroundMode\("theme"\)/);
  assert.match(source, /const nextBackground = isDarkTheme \? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND/);
  assert.match(source, /appState: \{ viewBackgroundColor: nextBackground \}/);
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

test("theme default canvas uses white in both application themes", async () => {
  const source = await readFile(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
  assert.match(source, /const LIGHT_CANVAS_BACKGROUND = "#ffffff"/);
  assert.match(source, /const DARK_CANVAS_BACKGROUND = "#ffffff"/);
  assert.match(source, /isDarkTheme \? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND/);
});
