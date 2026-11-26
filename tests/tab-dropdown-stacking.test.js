import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const tabsCss = read("../src/styles/canvas-tabs.css");
const pagesCss = read("../src/features/pages/pages.css");
const tabsJsx = read("../src/components/app/CanvasTabs.jsx");

test("top tab bar sits at z-40 and its tab/mode popovers at z-50", () => {
  assert.match(tabsCss, /\.app \.desktop-app-document-title-float \{\s*position: relative;\s*z-index: 40;/);
  assert.match(tabsCss, /\.app \.desktop-app-document-title-float \.canvas-tabs-overflow-menu \{\s*z-index: 50;/);
  assert.match(tabsCss, /\.canvas-tabs-bar \{\s*position: relative;\s*z-index: 40;/);
  assert.match(tabsCss, /\.canvas-tabs-overflow-menu,\s*\.canvas-tabs-active-menu,\s*\.canvas-tabs-closed-menu \{\s*z-index: 50;/);
  assert.ok(tabsCss.includes("top:calc(100% + 8px); right:0; z-index:50"), "create-canvas popover stays z-50");
});

test("an open tab popover lifts the bar above canvas-side layers", () => {
  assert.match(
    tabsCss,
    /\.desktop-app-document-title-float:has\(\.canvas-tabs-create-menu, \.canvas-tabs-active-menu, \.canvas-tabs-closed-menu\) \{\s*z-index: 10065;/
  );
});

test("the in-canvas Page Header stays in the lower canvas layer (z-10)", () => {
  const rules = [...pagesCss.matchAll(/\.pages-book-ui \{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(rules.length >= 2);
  for (const body of rules) {
    const z = body.match(/z-index:\s*(\d+)/);
    if (z) assert.equal(z[1], "10", `unexpected .pages-book-ui z-index in: ${body}`);
  }
  assert.doesNotMatch(pagesCss, /\.pages-book-ui \{[^}]*z-index:\s*10040/);
});

test("tab/mode popovers auto-dismiss on canvas or Page Header click and focus", () => {
  assert.ok(tabsJsx.includes("CANVAS_SURFACE_SELECTOR"));
  for (const selector of [".desktop-canvas-region", ".pages-book-ui", ".pages-editorial-header"]) {
    assert.ok(tabsJsx.includes(`"${selector}"`), selector);
  }
  for (const name of ["pointerdown", "mousedown", "touchstart", "focusin"]) {
    assert.ok(tabsJsx.includes(`"${name}"`), name);
  }
  assert.match(tabsJsx, /addEventListener\(name, dismissOnCanvasInteraction, true\)/);
  for (const setter of ["setOverflowOpen", "setActiveMenuOpen", "setClosedMenuOpen", "setCreateMenuOpen"]) {
    assert.ok(tabsJsx.includes(`${setter}(false);\n      setActiveMenuOpen`) || tabsJsx.includes(setter), setter);
  }
});
