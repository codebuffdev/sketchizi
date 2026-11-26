import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, isVisible, settle, isPhone } from "../helpers/suite-kit.js";
import { waitForTabs, readPersisted } from "../helpers/canvas.js";

async function createInfinityTab(page) {
  await page.locator(SEL.tabAdd).first().click();
  const menu = page.locator(SEL.tabCreateMenu).first();
  await menu.waitFor({ state: "visible", timeout: 4000 });
  await menu.locator(SEL.tabCreateOption).first().click();
  await settle(page);
}

test.describe("E · Canvas tabs", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("tab bar renders and the create menu fits the viewport", async ({ qa, page }) => {
    if (!(await isVisible(page, SEL.tabsBar))) return qa.gap("Canvas tabs", "tab bar not visible");
    await qa.checkpoint("tabs-bar");
    await page.locator(SEL.tabAdd).first().click();
    await expect(page.locator(SEL.tabCreateMenu).first()).toBeVisible();
    await qa.checkpoint("create-menu-open", { checks: ["overflow", "clipping", "overlap", "touch"] });
  });

  test("create, switch, rename and close a tab", async ({ qa, page }) => {
    if (!(await isVisible(page, SEL.tabAdd))) return qa.gap("Canvas tabs", "add-tab button not visible");
    await createInfinityTab(page);
    const tabs = await waitForTabs(page, (t) => t.length >= 2);
    expect.soft(tabs, "second tab was not persisted").not.toBeNull();
    await qa.checkpoint("two-tabs");

    // switch
    const items = page.locator(SEL.tab);
    if ((await items.count()) >= 2) { await items.first().click(); await settle(page); await qa.checkpoint("switched-tab"); }

    // rename (double-click)
    const active = page.locator(SEL.tab).first();
    await active.dblclick().catch(() => {});
    await settle(page);
    const rename = page.locator(`${SEL.tabInlineRename} input, ${SEL.tabInlineRename}`).first();
    if (await rename.isVisible().catch(() => false)) {
      await qa.checkpoint("rename-ui", { checks: ["overflow", "clipping", "overlap"] });
      const input = page.locator(`${SEL.tabInlineRename} input`).first();
      if (await input.isVisible().catch(() => false)) { await input.fill("A very long canvas tab name that should truncate gracefully"); await page.keyboard.press("Enter"); await settle(page); }
      await qa.checkpoint("renamed-long-name", { checks: ["overflow", "clipping", "overlap"] });
    } else {
      qa.gap("Tab rename", "double-click did not reveal an inline rename control");
    }

    // delete
    const before = (await readPersisted(page)).tabs?.length || 0;
    const close = page.locator(SEL.tabClose).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await settle(page);
      const confirm = page.getByRole("button", { name: /close|discard|delete|don.t save/i }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
      await settle(page);
      await qa.checkpoint("after-close");
      const after = await waitForTabs(page, (t) => t.length < before, { timeout: 5000 });
      expect.soft(after !== null || before === 0, "tab count did not decrease after closing").toBe(true);
    }
  });

  test("12 tabs: overflow menu and narrow-screen behaviour", async ({ qa, page }) => {
    test.setTimeout(180_000);
    if (!(await isVisible(page, SEL.tabAdd))) return qa.gap("Canvas tabs", "add-tab button not visible");
    for (let i = 0; i < 11; i += 1) {
      await createInfinityTab(page).catch(() => {});
      if (!(await isVisible(page, SEL.tabAdd))) break;
    }
    const tabs = await waitForTabs(page, (t) => t.length >= 10, { timeout: 15_000 });
    expect.soft(tabs && tabs.length, "expected 10+ tabs").toBeGreaterThanOrEqual(10);
    await qa.checkpoint("many-tabs", { checks: ["overflow", "clipping", "overlap", "touch", "text"] });

    const overflow = page.locator(SEL.tabOverflowTrigger).first();
    if (await overflow.isVisible().catch(() => false)) {
      await overflow.click();
      await expect(page.locator(SEL.tabOverflowMenu).first()).toBeVisible();
      await qa.checkpoint("overflow-menu", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
      // The menu must be scrollable rather than taller than the viewport.
      const m = await page.locator(SEL.tabOverflowMenu).first().boundingBox();
      expect.soft(m.y + m.height, "overflow menu extends below the viewport").toBeLessThanOrEqual(qa.viewport.height + 1);
    } else if (isPhone(qa)) {
      qa.gap("Tab overflow menu", "10+ tabs but no overflow trigger on a phone viewport (tabs may be reachable only by horizontal scroll)");
    }
  });
});
