import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BREAKPOINTS,
  computeClampOffset,
  getViewportClass,
  shouldDismissSheet,
} from "../src/features/device/responsiveShell.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles/responsive-fluid.css");
const app = read("../src/App.jsx");
const main = read("../src/main.jsx");
const html = read("../index.html");
const dock = read("../src/components/app/PrimaryDock.jsx");
const gate = read("../src/PhoneAccessGate.jsx");

test("viewport classes follow the 768 / 1024 breakpoints", () => {
  assert.deepEqual(BREAKPOINTS, { tablet: 768, desktop: 1024 });
  for (const [width, expected] of [
    [375, "phone"], [430, "phone"], [767, "phone"],
    [768, "tablet"], [820, "tablet"], [1023, "tablet"],
    [1024, "desktop"], [1366, "desktop"], [1440, "desktop"], [2560, "desktop"],
  ]) assert.equal(getViewportClass(width), expected, `${width}px`);
});

test("popover clamp keeps rects inside the viewport with a margin", () => {
  const bounds = { left: 0, top: 0, right: 375, bottom: 812 };
  assert.deepEqual(computeClampOffset({ left: 300, right: 420, top: 100, bottom: 200 }, bounds, 8), { dx: -53, dy: 0 });
  assert.deepEqual(computeClampOffset({ left: -20, right: 100, top: 780, bottom: 840 }, bounds, 8), { dx: 28, dy: -36 });
  assert.deepEqual(computeClampOffset({ left: 20, right: 100, top: 20, bottom: 100 }, bounds, 8), { dx: 0, dy: 0 });
  // Larger than the viewport: pin to the start edge instead of oscillating.
  assert.deepEqual(computeClampOffset({ left: 50, right: 700, top: 0, bottom: 100 }, bounds, 8), { dx: -42, dy: 8 });
});

test("sheet dismissal needs distance or flick velocity", () => {
  assert.equal(shouldDismissSheet({ dy: 0, velocity: 2, height: 500 }), false);
  assert.equal(shouldDismissSheet({ dy: 40, velocity: 0.1, height: 500 }), false);
  assert.equal(shouldDismissSheet({ dy: 130, velocity: 0.1, height: 500 }), true);
  assert.equal(shouldDismissSheet({ dy: 30, velocity: 0.9, height: 500 }), true);
});

test("fluid layer is the last stylesheet App imports", () => {
  const cssImports = [...app.matchAll(/import\s+"(\.\/[^"]+\.css)"/g)].map((m) => m[1]);
  assert.equal(cssImports.at(-1), "./styles/responsive-fluid.css");
  assert.match(main, /installResponsiveShell\(\);/);
});

test("canvas is full-bleed on dynamic viewport units and owns touch gestures", () => {
  assert.match(css, /:root \.canvas\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /overscroll-behavior:\s*none/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /\b100vh\b/);
});

test("all four safe-area insets are consumed", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(css, new RegExp(`env\\(safe-area-inset-${side}`));
  }
  assert.match(html, /viewport-fit=cover/);
});

test("phone sheets cap at 65dvh and touch targets are 44px", () => {
  assert.match(css, /--rf-sheet-max:\s*65dvh/);
  assert.match(css, /--rf-hit:\s*44px/);
  assert.match(css, /max-height:\s*var\(--rf-sheet-max\)/);
  assert.match(css, /\(max-width:\s*767\.98px\)/);
  assert.match(css, /\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023\.98px\)/);
});

test("dock is tap-to-toggle on hover-less devices", () => {
  assert.match(css, /\(hover:\s*none\)/);
  assert.match(dock, /\(hover: none\)/);
  assert.match(dock, /if \(!canHover\(\) && expanded\) \{ collapseDock\(\); return; \}/);
  assert.doesNotMatch(dock, /onMouseEnter=\{expandDock\}/);
});

test("phone gate no longer blocks phones by default but can be re-enabled", () => {
  assert.match(gate, /VITE_BLOCK_PHONES/);
  assert.match(gate, /BLOCK_PHONES && isCurrentDevicePhone\(\)/);
});
