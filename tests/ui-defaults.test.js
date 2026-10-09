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

test("theme synchronization uses explicit mode rather than a recognized-color allowlist", async () => {
  const source = await readFile(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
  assert.match(source, /canvasBackgroundMode !== "theme"/);
  assert.doesNotMatch(source, /initialThemeBackgrounds|new Set\(\["#ffffff"/);
  assert.match(source, /viewBackgroundColor: nextBackground/);
});

test("native Canvas background palette has an explicit automatic-mode action", async () => {
  const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
  assert.match(source, /data-sketchizi-theme-background-default/);
  assert.match(source, /Use theme default/);
  assert.match(source, /markCanvasBackgroundCustom\(\)/);
});
