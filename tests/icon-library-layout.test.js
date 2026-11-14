import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/icon-panel-v2.css", import.meta.url), "utf8");
const compact = await readFile(new URL("../src/styles/icon-panel-compact.css", import.meta.url), "utf8");
const mainEntry = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Icon Panel v2 CSS is imported in src/main.jsx after src/styles.css and targets both themes", () => {
  assert.match(mainEntry, /import "\.\/styles\/icon-panel-v2\.css";/);
  assert.ok(mainEntry.indexOf("./styles/icon-panel-v2.css") > mainEntry.indexOf("./styles.css"));
  assert.match(styles, /\.app \.desktop-resources-region > \.library-panel\.library-panel-redesign\.sk-icon-panel/);
  assert.match(styles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign\.sk-icon-panel/);
});

test("Icon Panel uses a compact 320x460 viewport-bounded drawer without a bulky footer", () => {
  assert.match(compact, /width:\s*min\(320px, calc\(100vw - 28px\)\)/);
  assert.match(compact, /height:\s*min\(460px, calc\(100dvh - var\(--sketchizi-desktop-header-height, 54px\) - 24px\)\)/);
  assert.doesNotMatch(panel, /<footer className="sk-icon-panel-footer">/);
});

test("Icon Panel renders accessible dialog, results count, view mode switcher, and close button", () => {
  assert.match(panel, /role="dialog" aria-modal="false"/);
  assert.match(panel, /className="sk-icon-panel-header"/);
  assert.match(panel, /className="sk-icon-panel-count"/);
  assert.match(panel, /aria-label="Grid view"/);
  assert.match(panel, /aria-label="List view"/);
  assert.match(panel, /aria-label="Close icon library"/);
});

test("Icon Panel includes search, quick filters, and a single-row catalog with accessible More menu", () => {
  assert.match(panel, /className="search sk-search-input"/);
  assert.match(panel, /className="sk-search-kbd"/);
  assert.match(panel, /className="sk-scope-tabs"/);
  assert.match(panel, />\s*All icons\s*<\/button>/);
  assert.match(panel, />\s*Saved\{favorites\.length > 0/);
  assert.match(panel, />\s*Recent\{recentIcons\.length > 0/);
  assert.match(panel, /className="library-source-tabs sk-catalog-tabs"/);
  assert.match(panel, /className="sk-catalog-tab-label"/);
  assert.match(compact, /\.sk-catalog-tabs\s*\{[^}]*display:\s*flex !important;/s);
  assert.match(panel, /aria-label="More icon collections"/);
  assert.match(panel, /role="menuitemradio"/);
  assert.match(panel, /extraCatalogTabs\.map/);
  assert.match(panel, /src="\/icons\/aws\.svg"/);
  assert.match(panel, /src="\/icons\/k8s-kubernetes\.svg"/);
});

test("Icon Panel exposes AWS/Kubernetes subcategory select and Mind Map starter bar", () => {
  assert.match(panel, /className="sk-subcategory-select"/);
  assert.match(panel, /Insert starter mind map/);
  assert.match(panel, /className="sk-quick-starter-btn"/);
});

test("Icon grid owns vertical scrolling and supports compact grid and list views", () => {
  assert.match(panel, /sk-icon-grid \$\{viewMode === "list" \? "is-list-view" : "is-grid-view"\}/);
  assert.match(styles, /\.sk-icon-grid[\s\S]*?overflow-y:\s*auto/);
  assert.match(compact, /\.sk-icon-grid\.is-grid-view\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.sk-icon-grid\.is-list-view[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /--skp-stage-bg:\s*#e7ecf4/);
});

test("Icon cards use accessible buttons, stop propagation on favorite/insert actions, and preserve original SVG insertion", async () => {
  const insertion = await readFile(new URL("../src/features/icon-library/iconInsertionService.js", import.meta.url), "utf8");
  assert.match(panel, /className="sk-icon-card-main"/);
  assert.match(panel, /className=\{`favorite-button sk-fav-btn/);
  assert.match(panel, /className="library-add-icon sk-add-btn"/);
  assert.match(panel, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(panel, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(panel, /selectedEssentialColor|essentialColors|tintColor/);
  assert.doesNotMatch(insertion, /tintMonochromeSvg|icon\.tintColor/);
  assert.match(insertion, /encodeURIComponent\(svg\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
