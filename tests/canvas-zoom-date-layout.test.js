import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dateStyles = readFileSync(new URL("../src/components/app/CanvasStartDate.css", import.meta.url), "utf8");

test("canvas zoom percentage is positioned in the bottom-left corner", () => {
  assert.match(dateStyles, /\.app \.excalidraw \.zoom-actions\s*\{[^}]*left:\s*22px[^}]*right:\s*auto[^}]*bottom:\s*18px/s);
  assert.match(dateStyles, /@media \(max-width:\s*520px\)[\s\S]*\.zoom-actions\s*\{[^}]*left:\s*10px[^}]*bottom:\s*12px/s);
  assert.match(dateStyles, /\.canvas-start-date-wrap\s*\{\s*position:\s*absolute;\s*right:\s*18px;\s*bottom:\s*18px/);
});
