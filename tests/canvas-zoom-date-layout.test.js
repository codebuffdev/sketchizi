import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dateStyles = readFileSync(new URL("../src/components/app/CanvasStartDate.css", import.meta.url), "utf8");

test("canvas zoom percentage is positioned in the bottom-left corner", () => {
  assert.match(dateStyles, /\.app \.excalidraw \.zoom-actions\s*\{[^}]*left:\s*22px[^}]*right:\s*auto[^}]*bottom:\s*18px/s);
  assert.match(dateStyles, /@media \(max-width:\s*520px\)[\s\S]*\.zoom-actions\s*\{[^}]*left:\s*10px[^}]*bottom:\s*12px/s);
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{\s*position:\s*absolute;\s*right:\s*18px;\s*bottom:\s*18px/);
});

test("zoom and date share one bottom row height and centre line", () => {
  assert.match(dateStyles, /--canvas-corner-row-height:\s*36px/);
  assert.match(dateStyles, /\.zoom-actions\.zoom-actions\s*\{[^}]*height:\s*var\(--canvas-corner-row-height\)/s);
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{[^}]*align-items:\s*center[^}]*height:\s*var\(--canvas-corner-row-height\)/s);
});

test("both controls use the same bottom inset at each breakpoint", () => {
  const desktopZoom = dateStyles.match(/\.app \.excalidraw \.zoom-actions\s*\{[^}]*bottom:\s*(\d+)px/s)[1];
  const desktopDate = dateStyles.match(/\.canvas-start-date-wrap\s*\{\s*position:\s*absolute;\s*right:\s*18px;\s*bottom:\s*(\d+)px/)[1];
  assert.equal(desktopZoom, desktopDate);
  const phone = dateStyles.match(/@media \(max-width:\s*520px\)\s*\{\s*\.canvas-start-date-wrap\s*\{[^}]*bottom:\s*(\d+)px/)[1];
  const phoneZoom = dateStyles.match(/@media \(max-width:\s*520px\)\s*\{\s*\.app \.excalidraw \.zoom-actions\s*\{[^}]*bottom:\s*(\d+)px/s)[1];
  assert.equal(phone, phoneZoom);
});

test("date pill is width-capped so it cannot collide with the zoom control", () => {
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{[^}]*max-width:\s*calc\(100% - 170px\)/s);
  assert.match(dateStyles, /\.canvas-start-date > span\s*\{[^}]*text-overflow:\s*ellipsis/s);
});
