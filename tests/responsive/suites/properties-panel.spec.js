import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, drawFixtureScene, selectRectA, openOrGap, closeSurface, isVisible, settle, vpClass } from "../helpers/suite-kit.js";
import { withKeyboard } from "../helpers/viewport.js";

const OPEN = { selector: SEL.propertiesPanel, controls: [SEL.propertiesOpenFromDock, ".properties-toggle"], command: "Open Properties" };

test.describe("G · Properties panel", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); await drawFixtureScene(qa); await selectRectA(qa); });

  test("opens as desktop panel / tablet drawer / phone bottom sheet", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Properties panel", OPEN))) return;
    const panel = page.locator(SEL.propertiesPanel).first();
    await expect(panel).toBeVisible();
    const b = await panel.boundingBox();
    const cls = vpClass(qa);
    if (cls === "phone") {
      expect.soft(Math.abs(b.y + b.height - qa.viewport.height), "phone: sheet should sit on the bottom edge").toBeLessThanOrEqual(4);
      expect.soft(b.width, "phone: sheet should span the width").toBeGreaterThanOrEqual(qa.viewport.width - 4);
      expect.soft(b.height, "phone: sheet should not exceed ~90% of the viewport").toBeLessThanOrEqual(qa.viewport.height * 0.9 + 2);
    } else {
      expect.soft(b.x + b.width, "panel exceeds viewport width").toBeLessThanOrEqual(qa.viewport.width + 1);
    }
    await qa.checkpoint(`panel-open-${cls}`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });

  test("long form scrolls inside the panel; inputs are usable", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Properties panel", OPEN))) return;
    const panel = page.locator(SEL.propertiesPanel).first();
    const scroll = await panel.evaluate((el) => {
      const sc = [el, ...el.querySelectorAll("*")].find((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1);
      if (!sc) return { scrollable: false };
      sc.scrollTop = sc.scrollHeight;
      return { scrollable: true, atEnd: Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 2 };
    });
    await settle(page);
    await qa.checkpoint(`form-scrolled-${scroll.scrollable ? "y" : "static"}`, { checks: ["overflow", "clipping", "touch", "text"] });
    const numeric = panel.locator("input[type=number], input[inputmode='numeric'], input[type=range]").first();
    if (await numeric.isVisible().catch(() => false)) {
      await numeric.scrollIntoViewIfNeeded();
      await numeric.focus();
      await page.keyboard.press("ArrowUp");
      await settle(page, { frames: 1 });
    } else qa.gap("Properties numeric input", "no numeric / range input visible in the panel");
    const select = panel.locator("select").first();
    if (await select.isVisible().catch(() => false)) { const opts = await select.locator("option").count(); expect.soft(opts).toBeGreaterThan(0); }
    await qa.checkpoint("inputs-exercised", { checks: ["overflow", "clipping", "overlap"] });
  });

  test("soft keyboard (visual viewport shrink) keeps the focused field visible", async ({ qa, page }) => {
    test.skip(!qa.viewport.hasTouch && !qa.viewport.isMobile, "keyboard simulation applies to touch viewports");
    if (!(await openOrGap(qa, "Properties panel", OPEN))) return;
    const field = page.locator(`${SEL.propertiesPanel} input[type=number], ${SEL.propertiesPanel} input[type=text], ${SEL.propertiesPanel} input:not([type])`).first();
    if (!(await field.isVisible().catch(() => false))) return qa.gap("Properties keyboard", "no text/number field to focus");
    await withKeyboard(page, async (size) => {
      await field.focus();
      await field.scrollIntoViewIfNeeded();
      await settle(page);
      const b = await field.boundingBox();
      expect.soft(b && b.y + b.height, "focused field is below the visible (keyboard) viewport").toBeLessThanOrEqual(size.height + 1);
      await qa.checkpoint("keyboard-open", { checks: ["overflow", "clipping", "overlap"], baseline: false });
    });
  });

  test("dismissal via close control and Escape", async ({ qa, page }) => {
    if (!(await openOrGap(qa, "Properties panel", OPEN))) return;
    const closed = await closeSurface(page, { selector: SEL.propertiesPanel, closeControls: [SEL.propertiesClose] });
    expect(closed, "properties panel did not dismiss").toBe(true);
    await qa.checkpoint("dismissed", { checks: ["overflow", "overlap"] });
    expect(await isVisible(page, SEL.excalidraw)).toBe(true);
  });
});
