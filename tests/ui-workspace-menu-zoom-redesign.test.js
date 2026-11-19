import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menuStyles = readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");
const navigationStyles = readFileSync(new URL("../src/styles/ui-modernization-navigation.css", import.meta.url), "utf8");

test("workspace menu has a refined surface, grouped actions, and light/dark theme support", () => {
  assert.match(menuStyles, /Workspace menu refresh/);
  assert.match(menuStyles, /width: min\(224px, calc\(100vw - 20px\)\)/);
  assert.match(menuStyles, /border-radius: 12px/);
  assert.match(menuStyles, /sketchizi-file-menu-actions > button:hover:not\(:disabled\)/);
  assert.match(menuStyles, /data-sketchizi-theme="dark"/);
  assert.match(menuStyles, /prefers-reduced-motion: reduce/);
});

test("zoom controls show a percentage chip without plus/minus buttons", () => {
  assert.match(navigationStyles, /\.zoom-actions \.zoom-out-button[\s\S]*?display: none !important/);
  assert.match(navigationStyles, /\.zoom-actions \.zoom-in-button[\s\S]*?display: none !important/);
  assert.match(navigationStyles, /\.zoom-actions \.reset-zoom-button/);
  assert.match(navigationStyles, /border-radius: 9px/);
  assert.match(navigationStyles, /font-variant-numeric: tabular-nums/);
});
