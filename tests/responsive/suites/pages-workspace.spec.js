import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, isVisible, settle, isPhone } from "../helpers/suite-kit.js";
import { inspectLayout, DIALOG_SELECTOR, PANEL_DEFS } from "../helpers/layout.js";

test.describe("K · Pages workspace", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot({ mode: "pages" }); });

  test("enters Pages mode with a locked viewport (no page-level scroll)", async ({ qa, page }) => {
    await expect(page.locator(SEL.pagesWorkspace).first()).toBeVisible();
    const scroll = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(document.body).overflowY };
    });
    expect.soft(scroll.scrollHeight - scroll.clientHeight, `Pages mode should lock the viewport; document scrolls by ${scroll.scrollHeight - scroll.clientHeight}px`).toBeLessThanOrEqual(2);
    await qa.checkpoint("pages-entered");
  });

  test("100vh vs 100dvh: does the Pages CSS clip content on mobile browsers?", async ({ qa, page }) => {
    // pages.css pins several containers to `height/min-height/max-height: 100vh !important`.
    // Headless Chromium has no collapsing URL bar, so vh === dvh here: the runtime
    // measurement below proves the layout fits TODAY, and the static scan (P3,
    // category dynamic-viewport) flags the rules that WILL overflow on real phones.
    const res = await inspectLayout(page, { dialogSelector: DIALOG_SELECTOR, panels: PANEL_DEFS, grids: [] });
    const ws = await page.locator(SEL.pagesWorkspace).first().boundingBox();
    expect.soft(ws.y + ws.height, "Pages workspace extends below the viewport").toBeLessThanOrEqual(qa.viewport.height + 1);
    const lastControl = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".pages-book-workspace button, .pages-book-workspace input, .pages-book-workspace [role=button]")].filter((e) => e.getBoundingClientRect().width > 0);
      const bottoms = els.map((e) => e.getBoundingClientRect().bottom);
      return bottoms.length ? Math.max(...bottoms) : 0;
    });
    expect.soft(lastControl, "a Pages control sits below the visible viewport").toBeLessThanOrEqual(qa.viewport.height + 1);
    if (res.vhRules.length && (qa.viewport.hasTouch || qa.viewport.isMobile)) {
      qa.record({ category: "dynamic-viewport", severity: "P2", message: `Pages mode uses ${res.vhRules.length} live 100vh rule(s) (no 100dvh). On iOS Safari / Android Chrome the toolbar-visible viewport is up to ~56–120px shorter than 100vh, which can push the footer / bottom controls below the fold.`, selector: res.vhRules.map((r) => r.selector).join(" | ").slice(0, 300), details: { rules: res.vhRules, probe: res.dvh } }, "vh-vs-dvh");
    }
    await qa.checkpoint("pages-vh-dvh", { checks: ["overflow", "clipping", "layout"] });
  });

  test("editorial header, page surface and footer are visible", async ({ qa, page }) => {
    for (const label of ["Book / notebook title", "Chapter title", "Chapter subtitle"]) {
      const f = page.locator(`[aria-label='${label}']`).first();
      if (await f.isVisible().catch(() => false)) { await f.fill(`${label} — a long editorial heading to test wrapping`); }
    }
    await settle(page);
    expect.soft(await isVisible(page, SEL.pagesSurface, 5000), "page canvas surface not visible").toBe(true);
    await qa.checkpoint("editorial-header", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });

  test("chapter navigation and chapters index", async ({ qa, page }) => {
    const index = page.locator("button[aria-label='Chapters Index'], [aria-label='Chapters Index']").first();
    if (await index.isVisible().catch(() => false)) { await index.click(); await settle(page); await qa.checkpoint("chapters-index", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] }); await page.keyboard.press("Escape"); }
    const next = page.locator(SEL.pagesNext).first();
    if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) { await next.click(); await settle(page); }
    await qa.checkpoint("chapter-nav", { checks: ["overflow", "clipping", "overlap", "touch"] });
  });

  test("create and delete a chapter", async ({ qa, page }) => {
    const add = page.locator("button[aria-label='Add Chapter']").first();
    if (!(await add.isVisible().catch(() => false))) {
      // On compact layouts the control may live inside the chapter popover.
      const trig = page.locator(SEL.pagesChapterTrigger).first();
      if (await trig.isVisible().catch(() => false)) { await trig.click(); await settle(page); }
    }
    const add2 = page.locator("button[aria-label='Add Chapter']").first();
    if (!(await add2.isVisible().catch(() => false))) return qa.gap("Pages chapter creation", "Add Chapter control not reachable");
    await add2.click();
    await settle(page);
    await qa.checkpoint("chapter-added", { checks: ["overflow", "clipping", "overlap", "touch", "text"] });
    const remove = page.locator(SEL.pagesChapterRemove).first();
    if (!(await remove.isVisible().catch(() => false))) return qa.gap("Pages chapter deletion", "no delete control visible after adding a chapter");
    await remove.click();
    await expect(page.locator(SEL.pagesDeleteConfirm).first()).toBeVisible({ timeout: 5000 });
    await qa.checkpoint("delete-confirm", { checks: ["overflow", "clipping", "touch", "layout"] });
    await page.locator(SEL.pagesDeleteSubmit).first().click();
    await settle(page);
    await qa.checkpoint("chapter-deleted", { checks: ["overflow", "clipping"] });
  });

  test("paper settings / page menu", async ({ qa, page }) => {
    const menu = page.locator("button[aria-label='Paper texture'], button:has-text('Paper'), .canvas-pages-menu-trigger").first();
    if (!(await menu.isVisible().catch(() => false))) return qa.gap("Pages paper settings", "paper settings trigger not found");
    await menu.click();
    await settle(page);
    await qa.checkpoint("paper-settings", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    if (isPhone(qa)) {
      const m = await page.locator(".canvas-pages-menu").first().boundingBox().catch(() => null);
      if (m) expect.soft(m.x + m.width, "pages menu wider than the phone viewport").toBeLessThanOrEqual(qa.viewport.width + 1);
    }
  });
});
