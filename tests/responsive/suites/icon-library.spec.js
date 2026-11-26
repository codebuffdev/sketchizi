import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openOrGap, closeSurface, isVisible, settle, canvasBox, pt } from "../helpers/suite-kit.js";
import { waitForElements } from "../helpers/canvas.js";

const OPEN = { selector: SEL.iconPanel, controls: [SEL.iconToggle], command: "Open Icon Library" };

test.describe("F · Icon library", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("open, render results and close", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    await expect(page.locator(SEL.iconPanel).first()).toBeVisible();
    await qa.checkpoint("library-open", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    const closed = await closeSurface(page, { selector: SEL.iconPanel, closeControls: [SEL.iconClose] });
    expect(closed, "library panel did not close").toBe(true);
    await qa.checkpoint("library-closed", { checks: ["overflow"] });
  });

  test("search narrows results; empty state is laid out", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    const search = page.locator(SEL.iconSearch).first();
    await expect(search).toBeVisible();
    await search.fill("qa-icon-01");
    await settle(page);
    await qa.checkpoint("search-results", { checks: ["overflow", "clipping", "overlap", "text"] });
    await search.fill("zzzz-no-such-icon-anywhere");
    await settle(page);
    await qa.checkpoint("search-empty", { checks: ["overflow", "clipping", "text", "layout"] });
  });

  test("category / quick filters are reachable", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    const filters = page.locator("[aria-label='Icon category'], [aria-label='Icon quick filters']").first();
    if (!(await filters.isVisible().catch(() => false))) return qa.gap("Icon library filters", "category / quick filter controls not visible");
    const buttons = filters.locator("button, option");
    const n = await buttons.count();
    if (n > 1) {
      const target = filters.locator("button").nth(Math.min(1, n - 1));
      if (await target.isVisible().catch(() => false)) await target.click().catch(() => {});
    }
    await settle(page);
    await qa.checkpoint("category-filtered", { checks: ["overflow", "clipping", "overlap", "touch", "text"] });
  });

  test("insert an icon onto the canvas", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    const insert = page.locator("button[aria-label^='Insert ']").first();
    if (!(await insert.isVisible({ timeout: 8000 }).catch(() => false))) return qa.gap("Icon insertion", "no 'Insert <icon>' button visible in the library");
    await insert.click();
    await settle(page);
    const els = await waitForElements(page, (list) => list.some((e) => e.type === "image" || e.type === "frame" || e.type === "embeddable" || e.customData), { timeout: 12_000 });
    expect.soft(els, "inserting an icon did not add a canvas element").not.toBeNull();
    await qa.checkpoint("icon-inserted");
  });

  test("save / favourite an icon (pinning)", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    const save = page.locator("button[aria-label^='Save ']").first();
    if (!(await save.isVisible({ timeout: 8000 }).catch(() => false))) return qa.gap("Icon favourites", "no 'Save <icon>' control visible");
    await save.click();
    await settle(page);
    await expect(page.locator("button[aria-label^='Remove '][aria-label$=' from saved']").first()).toBeVisible();
    await qa.checkpoint("icon-saved", { checks: ["overflow", "clipping", "touch"] });
  });

  test("grid responsiveness, list view and independent scrolling", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    await qa.checkpoint("grid-view", { checks: ["overflow", "layout"], grids: [{ name: "icon-results", selector: "[aria-label='Icon results'], .library-panel .icons" }] });
    const list = page.locator("button[aria-label='List view']").first();
    if (await list.isVisible().catch(() => false)) { await list.click(); await settle(page); await qa.checkpoint("list-view", { checks: ["overflow", "clipping", "text"] }); }
    // The results region must scroll on its own while the page body does not.
    const res = page.locator(SEL.iconResults).first();
    if (await res.isVisible().catch(() => false)) {
      const info = await res.evaluate((el) => { const before = window.scrollY; el.scrollTop = el.scrollHeight; return { scrollable: el.scrollHeight > el.clientHeight + 1, bodyScrolled: window.scrollY !== before, overflowY: getComputedStyle(el).overflowY }; });
      expect.soft(info.bodyScrolled, "scrolling the icon grid scrolled the page body").toBe(false);
    }
  });

  test("modal / panel positioning stays inside the viewport", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Icon library", OPEN))) return;
    const b = await page.locator(SEL.iconPanel).first().boundingBox();
    expect.soft(b.x).toBeGreaterThanOrEqual(-1);
    expect.soft(b.y).toBeGreaterThanOrEqual(-1);
    expect.soft(b.x + b.width, "panel right edge").toBeLessThanOrEqual(qa.viewport.width + 1);
    expect.soft(b.y + b.height, "panel bottom edge").toBeLessThanOrEqual(qa.viewport.height + 1);
    await qa.checkpoint("panel-positioned", { checks: ["overflow", "clipping", "overlap", "layout"] });
  });
});
