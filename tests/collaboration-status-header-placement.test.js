import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/floating-segmented-header.css", import.meta.url), "utf8");

test("collaboration creation and failure feedback remain accessible", () => {
  assert.match(header, /collaborationCreationState === "creating"/);
  assert.match(header, /collaborationCreationState === "failed"/);
  assert.match(header, /role="status"/);
  assert.match(header, /role="alert"/);
  assert.match(header, /onClick=\{createCollaboration\}/);
});

test("collaboration feedback is anchored below utility island, not inline", () => {
  assert.match(css, /desktop-app-header-island-right > \.collaboration-header-status\s*\{/);
  assert.match(css, /position: absolute/);
  assert.match(css, /inset: calc\(100% \+ 8px\) 0 auto auto/);
  assert.match(css, /max-width: min\(340px, calc\(100vw - 32px\)\)/);
});
