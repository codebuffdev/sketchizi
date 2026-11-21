import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dateStyles = readFileSync(new URL("../src/components/app/CanvasStartDate.css", import.meta.url), "utf8");
const dateComponent = readFileSync(new URL("../src/components/app/CanvasStartDate.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/components/app/CanvasTabs.jsx", import.meta.url), "utf8");

test("date picker is a fixed-width 36px header control with theme-aware surfaces", () => {
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{[^}]*flex:\s*0 0 auto[^}]*height:\s*36px/s);
  assert.match(dateStyles, /background:\s*rgba\(255, 255, 255, \.95\)/);
  assert.match(dateStyles, /\.app\.theme-dark \.canvas-start-date-wrap\s*\{[^}]*background:\s*rgba\(22,24,31,\.9\)/s);
});

test("date picker is mounted immediately after the New Board control in the tab controls group", () => {
  assert.match(tabs, /showAddButton &&[\s\S]*?\{trailingControl\}/);
  assert.match(header, /trailingControl=\{!activeIsTodoTab && canvasId \? <CanvasStartDate/);
});

test("calendar popover opens below the pill and includes month navigation and Today", () => {
  assert.match(dateStyles, /top:\s*calc\(100% \+ 8px\)/);
  assert.match(dateComponent, /aria-label="Previous month"/);
  assert.match(dateComponent, /aria-label="Next month"/);
  assert.match(dateComponent, />Today<\/button>/);
  assert.match(dateComponent, /grid-template-columns/);
});

test("date pill supports day stepping and the formatted month-day-year label", () => {
  assert.match(dateComponent, /aria-label="Previous day"/);
  assert.match(dateComponent, /aria-label="Next day"/);
  assert.match(dateComponent, /month:\s*"short", day:\s*"numeric", year:\s*"numeric"/);
});

test("native Excalidraw zoom controls are removed from the bottom viewport HUD", () => {
  assert.match(dateStyles, /\.app \.excalidraw \.zoom-actions\s*\{\s*display:\s*none !important;/);
  assert.doesNotMatch(dateStyles, /canvas-start-date-wrap\s*\{[^}]*position:\s*absolute[^}]*bottom:/s);
});
