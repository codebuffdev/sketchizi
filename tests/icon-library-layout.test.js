import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/icon-library-redesign.css", import.meta.url), "utf8");

test("Icon Library is a floating, viewport-constrained panel over the canvas", () => {
  assert.match(styles, /position:\s*fixed !important/);
  assert.match(styles, /width:\s*min\(780px, 68vw\)/);
  assert.match(styles, /height:\s*min\(590px, 68dvh\)/);
  assert.match(styles, /desktop-workspace-library-open::before/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) !important/);
});

test("Only the icon result grid owns vertical scrolling and has a visible purple scrollbar", () => {
  assert.match(panel, /className=\{`icon-grid library-icon-grid/);
  assert.match(styles, /\.library-icon-grid[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /scrollbar-color:\s*#783cf6 #171d29/);
  assert.match(styles, /library-icon-grid::\-webkit-scrollbar-thumb/);
});

test("Search, recent-search chips, and first-class source tabs are present", () => {
  assert.match(panel, /Search icons, tags, or categories/);
  assert.match(panel, /library-recent-searches/);
  assert.match(panel, /library-source-tabs/);
  assert.match(panel, /label: "Networking"/);
  assert.match(panel, /label: "UML"/);
  assert.match(panel, /label: "Mind Maps"/);
  assert.match(panel, /library-source-tabs/);
  assert.match(panel, /library-recent-searches/);
});

test("Floating library uses a smaller footprint and light theme overrides all core surfaces", async () => {
  const appStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /max-height:\s*calc\(100dvh - 64px\)/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign/);
  assert.match(appStyles, /library-icon-card \{[\s\S]*?background: #fff !important/);
  assert.match(appStyles, /desktop-workspace-library-open::before[\s\S]*?background: rgba\(30, 34, 52, \.20\) !important/);
});

test("Dialog uses a subtle translucent glass surface and a non-modal accessible panel role", () => {
  assert.match(styles, /backdrop-filter:\s*blur\(18px\) saturate\(125%\)/);
  assert.match(panel, /role="dialog" aria-modal="false"/);

});

test("Icon Library omits redundant title and instruction text and keeps the Escape hint at the top", async () => {
  assert.match(panel, /library-scroll-hint/);
  assert.ok(panel.indexOf('className="library-scroll-hint"') < panel.indexOf('className="library-panel-body library-panel-redesign-body"'));
  assert.doesNotMatch(panel, /Drag icons onto the canvas to place them precisely/);
  assert.doesNotMatch(panel, /id="icon-library-title"/);
  assert.match(styles, /library-panel-header-compact[\s\S]*?height:\s*34px/);
});

test("Mobile Icon Library is a compact two-thirds-height panel with search near the top", () => {
  assert.match(styles, /height:\s*min\(66dvh, 620px\)/);
  assert.match(styles, /align-items:\s*flex-start/);
  assert.match(styles, /library-panel-header-compact[\s\S]*?height:\s*30px/);
  assert.match(styles, /library-panel-redesign-body[\s\S]*?padding:\s*4px 11px 10px/);
});

test("Mobile Icon Library fills available vertical space instead of leaving a blank area above", () => {
  assert.match(styles, /height:\s*calc\(100dvh - var\(--sketchizi-desktop-header-height, 58px\) - 12px\)/);
  assert.match(styles, /library-panel-redesign-body[\s\S]*?flex:\s*1 1 auto/);
  assert.match(styles, /library-panel-header-compact[\s\S]*?flex:\s*0 0 30px/);
});

test("Icon Library removes the standalone close icon header and its blank space", () => {
  assert.doesNotMatch(panel, /className="mobile-panel-close"/);
  assert.match(styles, /library-panel-header-compact \{ display: none !important; \}/);
  assert.match(styles, /library-panel-redesign-body \{ padding-top: 12px; \}/);
});

test("Icon Library stays compact and centered on narrow viewports", () => {
  assert.match(styles, /width:\s*min\(440px, 78vw\) !important/);
  assert.match(styles, /align-items:\s*center/);
  assert.match(styles, /max-width:\s*calc\(100vw - 24px\) !important/);
});

test("Desktop Icon Library is a compact floating panel rather than a full-height dock", () => {
  assert.match(styles, /width:\s*min\(390px, calc\(100vw - 32px\)\) !important/);
  assert.match(styles, /height:\s*min\(650px, calc\(100dvh - var\(--sketchizi-desktop-header-height, 58px\) - 32px\)\) !important/);
  assert.match(styles, /border-radius:\s*16px/);
});

test("Compact mobile Icon Library uses single-column cards with readable labels", () => {
  assert.match(styles, /library-icon-grid \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important/);
  assert.match(styles, /library-icon-grid \.library-icon-card \{[\s\S]*?grid-template-columns:\s*64px minmax\(0, 1fr\) 34px !important/);
  assert.match(styles, /icon-name[\s\S]*?white-space:\s*nowrap/);
});

test("Compact mobile icon cards have large previews and non-overlapping readable content", () => {
  assert.match(styles, /library-icon-preview \{[\s\S]*?width:\s*72px !important;[\s\S]*?height:\s*72px !important/);
  assert.match(styles, /grid-template-columns:\s*76px minmax\(0, 1fr\) 32px !important/);
  assert.match(styles, /grid-auto-rows:\s*minmax\(84px, auto\)/);
  assert.match(styles, /text-overflow:\s*ellipsis !important/);
});

test("Floating Icon Library switches to readable single-column cards based on panel width", () => {
  assert.match(styles, /container-type:\s*inline-size/);
  assert.match(styles, /@container icon-library-panel \(max-width:\s*460px\)/);
  assert.match(styles, /grid-template-columns:\s*72px minmax\(0, 1fr\) 34px !important/);
  assert.match(styles, /icon-name[\s\S]*?word-break:\s*normal !important/);
});

test("Icon Library footer keeps Escape-to-close and removes redundant scroll-count text", () => {
  assert.match(panel, /library-escape-hint/);
  assert.match(panel, /<kbd>Esc<\/kbd> to close/);
  assert.doesNotMatch(panel, /Showing \{Math\.min\(iconDisplayLimit/);
  assert.doesNotMatch(panel, /scroll for more/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?background:\s*transparent !important/);
});

test("Icon Library does not expose icon color controls before insertion", () => {
  assert.doesNotMatch(panel, /library-essential-colors/);
  assert.doesNotMatch(panel, /selectedEssentialColor|essentialColors|tintColor/);
});

test("library icon insertion preserves original SVG artwork without applying a library tint", async () => {
  const insertion = await readFile(new URL("../src/features/icon-library/iconInsertionService.js", import.meta.url), "utf8");
  assert.doesNotMatch(insertion, /tintMonochromeSvg|icon\.tintColor/);
  assert.match(insertion, /encodeURIComponent\(svg\)/);
});


test("Icon Library Escape hint stays above results and does not cover the final icon row", () => {
  const footer = panel.indexOf('<div className="library-scroll-hint"><span className="library-escape-hint"><kbd>Esc</kbd> to close</span></div>');
  const body = panel.indexOf('<div className="library-panel-body library-panel-redesign-body">');
  assert.ok(footer >= 0 && body > footer);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?position:\s*static !important/);
  assert.match(styles, /library-scroll-hint[\s\S]*?flex:\s*0 0 auto !important/);
  assert.match(styles, /library-icon-grid[\s\S]*?min-height:\s*0 !important/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?margin:\s*0 !important/);
});


test("Icon Library outer card is transparent and Escape hint is centered without a background", () => {
  assert.match(styles, /\.desktop-resources-region > \.library-panel\.library-panel-redesign[\s\S]*?background:\s*transparent !important/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?justify-content:\s*center !important/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?background:\s*transparent !important/);
});


test("Light theme keeps the Icon Library frameless and its Escape hint centered and transparent", async () => {
  const appStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign[\s\S]*?background:\s*transparent !important/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign > \.library-scroll-hint[\s\S]*?justify-content:\s*center !important/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign > \.library-scroll-hint[\s\S]*?background:\s*transparent !important/);
});


test("Escape-to-close hint always renders even when icon results are capped", () => {
  assert.match(panel, /<div className="library-scroll-hint"><span className="library-escape-hint"><kbd>Esc<\/kbd> to close<\/span><\/div>/);
  assert.doesNotMatch(panel, /displayedIcons\.length > iconDisplayLimit && <div className="library-scroll-hint"/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?background:\s*transparent !important/);
  assert.match(styles, /\.library-panel-redesign > \.library-scroll-hint[\s\S]*?justify-content:\s*center !important/);
});


test("Floating Icon Library is top-aligned rather than vertically centered", () => {
  assert.match(styles, /desktop-workspace-library-open > \.desktop-resources-region\.mobile-resource-open[\s\S]*?align-items:\s*flex-start !important/);
  assert.match(styles, /desktop-workspace-library-open > \.desktop-resources-region\.mobile-resource-open[\s\S]*?padding-top:\s*max\(16px, env\(safe-area-inset-top, 0px\)\) !important/);
  assert.match(styles, /desktop-workspace-library-open \.desktop-resources-region > \.library-panel\.library-panel-redesign[\s\S]*?align-self:\s*flex-start !important/);
});


test("Escape hint appears above the search and the icon list owns the remaining panel height", () => {
  const footer = panel.indexOf('<div className="library-scroll-hint"><span className="library-escape-hint"><kbd>Esc</kbd> to close</span></div>');
  const body = panel.indexOf('<div className="library-panel-body library-panel-redesign-body">');
  assert.ok(footer >= 0 && body > footer, "Escape hint must render before the search and icon results");
  assert.match(styles, /library-panel-redesign \{[\s\S]*?max-height:\s*calc\(100dvh - 32px\) !important/);
  assert.match(styles, /library-panel-redesign > \.library-panel-redesign-body[\s\S]*?overflow:\s*hidden !important/);
  assert.match(styles, /library-panel-redesign \.library-icon-grid[\s\S]*?overflow-y:\s*auto !important/);
});


test("Icon Library outer panel uses the same neutral surface, border, radius, and shadow as the hamburger menu", async () => {
  const appStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appStyles, /\.app \.desktop-resources-region > \.library-panel\.library-panel-redesign\s*\{[\s\S]*?border:\s*1px solid var\(--ui-border,[\s\S]*?border-radius:\s*14px !important;[\s\S]*?background:\s*var\(--ui-surface-solid,[\s\S]*?box-shadow:\s*var\(--ui-shadow,/);
  assert.match(appStyles, /\.app\.theme-dark \.desktop-resources-region > \.library-panel\.library-panel-redesign\s*\{[\s\S]*?background:\s*var\(--ui-surface-solid,[\s\S]*?box-shadow:\s*var\(--ui-shadow,/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign\s*\{[\s\S]*?background:\s*var\(--ui-surface-solid,[\s\S]*?box-shadow:\s*var\(--ui-shadow,/);
});


test("Icon collection filters use compact icon-only buttons with accessible names", () => {
  assert.match(panel, /function SourceCategoryIcon\(\{ id \}\)/);
  assert.match(panel, /aria-label=\{tab\.label\} title=\{tab\.label\}/);
  assert.match(panel, /<SourceCategoryIcon id=\{tab\.id\} \/>/);
  assert.match(panel, /library-source-art-\$\{id\}/);
  assert.match(styles, /background-image:\s*url\("\/icons\/category-icons\.png"\)/);
  assert.match(panel, /className="library-source-chip-label"/);
  assert.match(styles, /\.app \.library-panel-redesign \.library-source-tabs\s*\{\s*display:\s*flex;\s*flex-wrap:\s*nowrap;/);
  assert.match(styles, /\.app \.library-panel-redesign \.library-source-chip-label\s*\{[\s\S]*?clip:\s*rect\(0, 0, 0, 0\)/);
  assert.match(styles, /\.app \.library-panel-redesign \.library-source-art\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?background-size:\s*168px 24px/);
});


test("active Icon Library category filters use neutral meta colors instead of purple", () => {
  assert.match(styles, /\.app \.library-panel-redesign \.library-source-chip\.active,[\s\S]*?background-image:\s*none !important;[\s\S]*?color:\s*#f1f4fa !important/);
  assert.match(styles, /\.app\.theme-light \.library-panel-redesign \.library-source-chip\.active,[\s\S]*?background:\s*#e3e7ee !important;[\s\S]*?color:\s*#343b49 !important/);
});


test("category icons follow the requested order and render 15 percent larger", async () => {
  const component = await readFile(new URL("../src/IconLibraryPanel.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles/icon-library-redesign.css", import.meta.url), "utf8");
  const start = component.indexOf("const sourceTabs = [");
  const end = component.indexOf("];", start);
  const tabs = component.slice(start, end);
  const ids = [...tabs.matchAll(/\{ id: "([^"]+)", label:/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["all", "eraser", "aws", "kubernetes", "networking", "uml", "mindmaps"]);
  assert.match(component, /library-source-art/);
  assert.match(styles, /background-size:\s*168px 24px/);
});
