import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openCommand, isVisible, settle } from "../helpers/suite-kit.js";

async function openGallery(qa) {
  await openCommand(qa.page, "Browse Design Templates").catch(() => {});
  const ok = await isVisible(qa.page, SEL.designScreen, 10_000);
  if (!ok) qa.gap("Design Studio", `template gallery did not open from "Browse Design Templates" at ${qa.viewport.id}`);
  return ok;
}

const GRIDS = [{ name: "template-grid", selector: ".design-studio-template-grid" }];

test.describe("L · Design Studio", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("template gallery renders and the grid reflows", async ({ qa, page }) => {
    if (!(await openGallery(qa))) return;
    await expect(page.locator(SEL.designTemplates).first()).toBeVisible();
    const { stats } = await qa.checkpoint("gallery", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"], grids: GRIDS });
    const cols = stats.grids?.find((g) => g.name === "template-grid")?.columns;
    if (cols != null) {
      const w = qa.viewport.width;
      const max = w < 520 ? 2 : w < 900 ? 3 : 8;
      expect.soft(cols, `template grid has ${cols} columns at ${w}px`).toBeLessThanOrEqual(max);
      expect.soft(cols).toBeGreaterThanOrEqual(1);
    }
  });

  test("search and category navigation", async ({ qa, page }) => {
    if (!(await openGallery(qa))) return;
    const search = page.locator(SEL.designSearch).first();
    await expect(search).toBeVisible();
    await search.fill("aws");
    await settle(page);
    await qa.checkpoint("search-aws", { checks: ["overflow", "clipping", "overlap", "text", "layout"], grids: GRIDS });
    await search.fill("zzzz-nothing-matches");
    await settle(page);
    await qa.checkpoint("search-empty", { checks: ["overflow", "clipping", "text"] });
    await search.fill("");
    const cats = page.locator(`${SEL.designCategories} button`);
    const n = await cats.count();
    if (n > 1) {
      // Category strip may scroll horizontally on phones; the last category must be reachable.
      const last = cats.nth(n - 1);
      await last.scrollIntoViewIfNeeded().catch(() => {});
      await last.click().catch(() => {});
      await settle(page);
      await qa.checkpoint("last-category", { checks: ["overflow", "clipping", "overlap", "touch"], grids: GRIDS });
    } else qa.gap("Design Studio categories", "category tabs not found");
  });

  test("template selection shows a sticky selection bar", async ({ qa, page }) => {
    if (!(await openGallery(qa))) return;
    const card = page.locator(`${SEL.designTemplates} button, .design-studio-template-grid button`).first();
    if (!(await card.isVisible({ timeout: 6000 }).catch(() => false))) return qa.gap("Design template selection", "no template card visible");
    await card.click();
    await settle(page);
    const bar = page.locator(".design-studio-selection-bar").first();
    await expect(bar).toBeVisible({ timeout: 6000 });
    await qa.checkpoint("template-selected", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"], grids: GRIDS });
    // Scroll the catalog: the selection bar must stay inside the viewport (sticky / fixed).
    await page.locator(".design-studio-catalog").first().evaluate((el) => { el.scrollTop = el.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }).catch(() => {});
    await settle(page);
    const b = await bar.boundingBox();
    expect.soft(b && b.y + b.height, "selection bar scrolled below the viewport").toBeLessThanOrEqual(qa.viewport.height + 1);
    expect.soft(b && b.y, "selection bar scrolled above the viewport").toBeGreaterThanOrEqual(-1);
    await qa.checkpoint("selection-bar-after-scroll", { checks: ["overflow", "clipping", "overlap"] });
  });

  test("configuration form and design generation", async ({ qa, page }) => {
    if (!(await openGallery(qa))) return;
    const card = page.locator(`${SEL.designTemplates} button, .design-studio-template-grid button`).first();
    if (!(await card.isVisible({ timeout: 6000 }).catch(() => false))) return qa.gap("Design configuration", "no template card visible");
    await card.click();
    const cfg = page.locator(".design-studio-configure-toggle").first();
    if (await cfg.isVisible().catch(() => false)) { await cfg.click(); await settle(page); await qa.checkpoint("configuration-form", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] }); }
    else qa.gap("Design configuration form", "configure toggle not visible after selecting a template");
    const primary = page.locator(".design-studio-primary-action").first();
    if (!(await primary.isVisible().catch(() => false))) return qa.gap("Design generation", "primary action not visible");
    await primary.click();
    await settle(page);
    // Either a dialog (naming) or the generated canvas must appear; the gallery must not be stuck.
    const outcome = await Promise.race([
      page.locator(SEL.designDialog).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => "dialog"),
      page.locator(SEL.designScreen).first().waitFor({ state: "hidden", timeout: 10_000 }).then(() => "generated"),
    ]).catch(() => "none");
    expect.soft(outcome, "generating a design produced neither a dialog nor a canvas").not.toBe("none");
    await qa.checkpoint(`after-generate-${outcome}`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });
});
