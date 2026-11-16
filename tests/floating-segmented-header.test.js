import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/floating-segmented-header.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("floating segmented header separates navigation, workspace and utilities", () => {
  const left = header.indexOf('desktop-app-header-island-left');
  const center = header.indexOf('desktop-app-header-island-center');
  const right = header.indexOf('desktop-app-header-island-right');
  assert.ok(left >= 0 && center > left && right > center);
  assert.ok(header.indexOf('{workspaceToggle}') > center);
  assert.ok(header.indexOf('{workspaceToggle}') < right);
  assert.ok(header.indexOf('desktop-app-document-identity') > center);
  assert.ok(header.indexOf('desktop-app-document-identity') < right);
});

test("segmented header retains original controls and responsive fallback", () => {
  assert.match(header, /sketchizi-header-grid/);
  assert.match(header, /desktop-app-save-status-wrap/);
  assert.match(header, /desktop-app-start-collaboration-button/);
  assert.match(header, /desktop-app-header-visibility-button/);
  assert.match(css, /grid-template-columns:/);
  assert.match(css, /max-width: 1099px/);
  assert.match(entry, /floating-segmented-header\.css/);
});
