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
  const headerEnd = header.indexOf("</header>");
  assert.ok(left >= 0 && center > left && right > center && right < headerEnd);
  // The workspace switcher and the document identity are floating siblings of the
  // segmented header rather than members of its islands.
  const workspaceButton = header.indexOf("className={`desktop-app-workspace-button");
  const identity = header.indexOf("desktop-app-document-title-float");
  assert.ok(workspaceButton > headerEnd);
  assert.ok(identity > headerEnd);
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
