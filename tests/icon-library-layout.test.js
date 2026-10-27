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

test("Search, recent-search chips, first-class source tabs, and view controls are present", () => {
  assert.match(panel, /Search icons, tags, or categories/);
  assert.match(panel, /library-recent-searches/);
  assert.match(panel, /library-source-tabs/);
  assert.match(panel, /label: "Networking"/);
  assert.match(panel, /label: "UML"/);
  assert.match(panel, /label: "Mind Maps"/);
  assert.match(panel, /library-view-toggle/);
});

test("Floating library uses a smaller footprint and light theme overrides all core surfaces", async () => {
  const appStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /max-height:\s*calc\(100dvh - 64px\)/);
  assert.match(appStyles, /\.app\.theme-light \.desktop-resources-region > \.library-panel\.library-panel-redesign/);
  assert.match(appStyles, /library-icon-card \{[\s\S]*?background: #fff !important/);
  assert.match(appStyles, /desktop-workspace-library-open::before[\s\S]*?background: rgba\(30, 34, 52, \.20\) !important/);
});

test("Dialog uses a subtle translucent glass surface and accessible compact layout control", () => {
  assert.match(styles, /backdrop-filter:\s*blur\(18px\) saturate\(125%\)/);
  assert.match(panel, /aria-label="Card layout"/);
  assert.equal(panel.includes('<span className="sr-only">Card layout</span>'), false);
});

test("Icon Library header omits redundant title and instruction text while retaining close control", async () => {
  assert.match(panel, /library-panel-header-compact/);
  assert.doesNotMatch(panel, /Drag icons onto the canvas to place them precisely/);
  assert.doesNotMatch(panel, /id="icon-library-title"/);
  assert.match(panel, /aria-label="Close Icon Library"/);
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


test("Icon Library Escape footer stays at the panel edge without covering the final icon row", () => {
  assert.match(panel, /<\/section>\s*<\/div>\s*\{displayedIcons\.length > iconDisplayLimit && <div className="library-scroll-hint"/);
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
