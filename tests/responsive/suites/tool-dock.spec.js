import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openOrGap, isVisible, settle, isTouch } from "../helpers/suite-kit.js";
import { touchTap } from "../helpers/canvas.js";

test.describe("C · Primary tool dock", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("collapsed and expanded states", async ({ qa, page }) => {
    const dock = page.locator(SEL.primaryDock).first();
    if (!(await dock.isVisible().catch(() => false))) return qa.gap("Primary tool dock", "dock not visible");
    await qa.checkpoint("collapsed");
    const toggle = page.locator(".sketchizi-tool-sidebar-expand").first();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(dock).toHaveClass(/is-expanded/);
    await settle(page);
    await qa.checkpoint("expanded");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("active tool indicator follows tool selection", async ({ qa, page }) => {
    const toggle = page.locator(".sketchizi-tool-sidebar-expand").first();
    if (!(await toggle.isVisible().catch(() => false))) return qa.gap("Primary tool dock", "expand toggle not visible");
    await toggle.click();
    const rect = page.locator(`${SEL.primaryDockButton}[aria-label*='Rectangle' i]`).first();
    await expect(rect).toBeVisible();
    await rect.click();
    await settle(page);
    const active = page.locator(".sketchizi-tool-sidebar-active").first();
    if (await active.isVisible().catch(() => false)) await expect(active).toHaveAttribute("aria-label", /Rectangle/i);
    await qa.checkpoint("rectangle-active");
  });

  test("every tool button is reachable inside the viewport (incl. last tool)", async ({ qa, page }) => {
    const toggle = page.locator(".sketchizi-tool-sidebar-expand").first();
    if (!(await toggle.isVisible().catch(() => false))) return qa.gap("Primary tool dock", "expand toggle not visible");
    await toggle.click();
    await settle(page);
    const buttons = page.locator(SEL.primaryDockButton);
    const n = await buttons.count();
    expect(n).toBeGreaterThan(3);
    const list = page.locator(".sketchizi-tool-sidebar-list").first();
    const scrolls = await list.evaluate((el) => ({ x: el.scrollWidth > el.clientWidth + 1, y: el.scrollHeight > el.clientHeight + 1 }));
    // Horizontal / vertical scrolling is allowed; the LAST tool must become reachable by scrolling.
    const last = buttons.nth(n - 1);
    await last.scrollIntoViewIfNeeded().catch(() => {});
    await settle(page);
    const box = await last.boundingBox();
    expect.soft(box, "last tool has no box").not.toBeNull();
    if (box) {
      expect.soft(box.x, "last tool left of viewport").toBeGreaterThanOrEqual(-1);
      expect.soft(box.y, "last tool above viewport").toBeGreaterThanOrEqual(-1);
      expect.soft(box.x + box.width, "last tool beyond right edge after scrolling").toBeLessThanOrEqual(qa.viewport.width + 1);
      expect.soft(box.y + box.height, "last tool beyond bottom edge after scrolling").toBeLessThanOrEqual(qa.viewport.height + 1);
    }
    await qa.checkpoint(`all-tools (${scrolls.x ? "h-scroll" : scrolls.y ? "v-scroll" : "no-scroll"})`);
  });

  test("touch interaction selects a tool", async ({ qa, page }) => {
    test.skip(!isTouch(qa), "touch-only interaction");
    const toggle = page.locator(".sketchizi-tool-sidebar-expand").first();
    if (!(await toggle.isVisible().catch(() => false))) return qa.gap("Primary tool dock", "expand toggle not visible");
    const tb = await toggle.boundingBox();
    await touchTap(page, { x: Math.round(tb.x + tb.width / 2), y: Math.round(tb.y + tb.height / 2) });
    await settle(page);
    await expect(page.locator(SEL.primaryDock).first()).toHaveClass(/is-expanded/);
    await qa.checkpoint("touch-expanded");
  });

  test("dock behaves while the icon library is open", async ({ qa, page }) => {
    const ok = await openOrGap(qa, "Icon library", { selector: SEL.iconPanel, controls: [SEL.iconToggle], command: "Open Icon Library" });
    if (!ok) return;
    await qa.checkpoint("dock-with-library-open");
    expect.soft(await isVisible(page, SEL.primaryDock) || vpHidden(qa), "dock vanished while library open (acceptable only on small viewports)").toBe(true);
  });
});

function vpHidden(qa) { return qa.viewport.width < 768; }
