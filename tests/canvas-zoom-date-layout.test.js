import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dateStyles = readFileSync(new URL("../src/components/app/CanvasStartDate.css", import.meta.url), "utf8");
const dateComponent = readFileSync(new URL("../src/components/app/CanvasStartDate.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");

test("date pill is a quiet, non-shrinking 36px metadata control with theme-aware surfaces", () => {
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{[^}]*flex-shrink:\s*0[^}]*height:\s*36px/s);
  assert.match(dateStyles, /\.canvas-start-date\s*\{[^}]*padding:\s*0 10px[^}]*border-radius:\s*10px[^}]*opacity:\s*\.82/s);
  assert.match(dateStyles, /\.app\.theme-dark \.canvas-start-date\s*\{/);
});

test("date picker is mounted in the top utility cluster immediately before the zoom control", () => {
  const dateIndex = header.indexOf('<CanvasStartDate key={canvasId}');
  const zoomIndex = header.indexOf('<CanvasZoomControl');
  assert(dateIndex >= 0 && zoomIndex > dateIndex, "date picker must precede the zoom pill in the top utility cluster");
});

test("start date popover is right-aligned below the pill with Reset and month navigation", () => {
  assert.match(dateStyles, /top:\s*calc\(100% \+ 8px\)/);
  assert.match(dateStyles, /right:\s*0/);
  assert.match(dateStyles, /width:\s*320px/);
  assert.match(dateComponent, /Document Start Date/);
  assert.match(dateComponent, />Reset<\/button>/);
  assert.match(dateComponent, /aria-label="Previous month"/);
  assert.match(dateComponent, /aria-label="Next month"/);
  assert.match(dateStyles, /grid-template-columns/);
});

test("date pill has no day steppers and keeps the month-day-year label", () => {
  assert.doesNotMatch(dateComponent, /Previous day|Next day|canvas-start-date-stepper/);
  assert.match(dateComponent, /month:\s*"short", day:\s*"numeric", year:\s*"numeric"/);
});

test("native Excalidraw zoom controls are removed from the bottom viewport HUD", () => {
  assert.match(dateStyles, /\.app \.excalidraw \.zoom-actions\s*\{\s*display:\s*none !important;/);
  assert(dateStyles.includes(".app.canvas-first-header .desktop-app-top-controls > .canvas-start-date-wrap {\n    display: none !important;"), "the date pill must not overlap the compact phone header");
  assert.doesNotMatch(dateStyles, /canvas-start-date-wrap\s*\{[^}]*position:\s*absolute[^}]*bottom:/s);
});
