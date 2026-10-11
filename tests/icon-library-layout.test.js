import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/icon-library-redesign.css", import.meta.url), "utf8");

test("Icon Library is a floating, viewport-constrained panel over the canvas", () => {
  assert.match(styles, /position:\s*fixed !important/);
  assert.match(styles, /width:\s*min\(920px, 74vw\)/);
  assert.match(styles, /height:\s*min\(680px, 72dvh\)/);
  assert.match(styles, /desktop-workspace-library-open::before/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) !important/);
});

test("Only the icon result grid owns vertical scrolling and has a visible purple scrollbar", () => {
  assert.match(panel, /className=\{`icon-grid library-icon-grid/);
  assert.match(styles, /\.library-icon-grid[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /scrollbar-color:\s*#783cf6 #171d29/);
  assert.match(styles, /library-icon-grid::\-webkit-scrollbar-thumb/);
});

test("Search, recent-search chips, collection menu, and view controls are present", () => {
  assert.match(panel, /Search icons, tags, or categories/);
  assert.match(panel, /library-recent-searches/);
  assert.match(panel, /library-collections-menu/);
  assert.match(panel, /library-view-toggle/);
});

test("Floating library uses a smaller footprint and light theme overrides all core surfaces", async () => {
  const appStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /max-height:\s*calc\(100dvh - 64px\)/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign/);
  assert.match(appStyles, /library-icon-card \{[\s\S]*?background: #fff !important/);
  assert.match(appStyles, /desktop-workspace-library-open::before[\s\S]*?background: rgba\(30, 34, 52, \.20\) !important/);
});
