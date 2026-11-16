import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("active collaboration controls render in an independent floating bar", async () => {
  const source = await readFile(new URL("../src/components/app/CollaborationUI.jsx", import.meta.url), "utf8");
  assert.match(source, /setHeaderTarget\\(document\\.querySelector\\(\"\\.app\"\\) \\|\\| document\\.body\\)/);
  assert.match(source, /createPortal\(controls, headerTarget\)/);
  assert.match(source, /collaboration-header-controls collaboration-floating-bar/);
  assert.match(source, /collaboration-header-live-state/);
  assert.doesNotMatch(source, /querySelector\("\.desktop-app-header-account-zone"\)/);
});

test("floating collaboration bar stays separate from the canvas header and adapts to narrow screens", async () => {
  const css = await readFile(new URL("../src/styles/collaboration-redesign.css", import.meta.url), "utf8");
  assert.match(css, /\.app \.collaboration-floating-bar\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.app \.collaboration-floating-bar\s*\{[^}]*left:\s*50%/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.app \.collaboration-floating-bar/);
  assert.match(css, /\.app\.theme-dark \.collaboration-floating-bar/);
});
