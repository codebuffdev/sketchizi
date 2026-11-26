import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, drawFixtureScene, isVisible, settle } from "../helpers/suite-kit.js";
import { withKeyboard } from "../helpers/viewport.js";

async function openExport(qa) {
  const page = qa.page;
  await page.locator(SEL.excalidraw).first().focus().catch(() => {});
  await page.keyboard.press("ControlOrMeta+Shift+E"); // registerExportStudioShortcut
  const ok = await isVisible(page, SEL.exportModal, 8000);
  if (!ok) qa.gap("Export Studio", `Ctrl/Cmd+Shift+E did not open the export dialog at ${qa.viewport.id}`);
  return ok;
}

test.describe("O · Export studio and dialogs", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); await drawFixtureScene(qa); });

  test("opens, fits the viewport and closes", async ({ qa, page }) => {
    if (!(await openExport(qa))) return;
    const b = await page.locator(SEL.exportModal).first().boundingBox();
    expect.soft(b.y + b.height, "export dialog taller than the viewport").toBeLessThanOrEqual(qa.viewport.height + 1);
    expect.soft(b.x + b.width, "export dialog wider than the viewport").toBeLessThanOrEqual(qa.viewport.width + 1);
    await qa.checkpoint("export-open", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    const close = page.locator(SEL.exportClose).first();
    if (await close.isVisible().catch(() => false)) await close.click(); else await page.keyboard.press("Escape");
    await expect(page.locator(SEL.exportModal).first()).toBeHidden({ timeout: 6000 });
  });

  test("format selection renders a preview for each format", async ({ qa, page }) => {
    if (!(await openExport(qa))) return;
    const pills = page.locator(SEL.exportPill);
    const n = await pills.count();
    if (!n) return qa.gap("Export formats", "no format pills found (.sketchizi-export-pill-row button)");
    for (let i = 0; i < Math.min(n, 6); i += 1) {
      const pill = pills.nth(i);
      const label = ((await pill.textContent()) || `format-${i}`).trim().slice(0, 24);
      if (!(await pill.isVisible().catch(() => false))) continue;
      await pill.scrollIntoViewIfNeeded().catch(() => {});
      await pill.click();
      await settle(page);
      await qa.checkpoint(`format-${label}`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    }
  });

  test("dialog body scrolls and footer actions stay reachable", async ({ qa, page }) => {
    if (!(await openExport(qa))) return;
    const info = await page.locator(SEL.exportModal).first().evaluate((el) => {
      const sc = [el, ...el.querySelectorAll("*")].find((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1);
      if (sc) sc.scrollTop = sc.scrollHeight;
      return { scrollable: Boolean(sc) };
    });
    await settle(page);
    const actions = page.locator(`${SEL.exportModal} button`).filter({ hasText: /download|export|save|copy/i });
    const n = await actions.count();
    if (!n) return qa.gap("Export actions", "no download / export / copy buttons found");
    const last = actions.nth(n - 1);
    await last.scrollIntoViewIfNeeded().catch(() => {});
    const b = await last.boundingBox();
    expect.soft(b && b.y + b.height, "footer action is below the viewport even after scrolling").toBeLessThanOrEqual(qa.viewport.height + 1);
    expect.soft(b && b.x + b.width, "footer action is beyond the right edge").toBeLessThanOrEqual(qa.viewport.width + 1);
    await qa.checkpoint(`footer-actions-${info.scrollable ? "scrolled" : "static"}`, { checks: ["overflow", "clipping", "overlap", "touch", "text"] });
  });

  test("download action produces a file", async ({ qa, page }) => {
    if (!(await openExport(qa))) return;
    const actions = page.locator(`${SEL.exportModal} button`).filter({ hasText: /download|save/i });
    if (!(await actions.count())) return qa.gap("Export download", "no download/save button in the dialog");
    const btn = actions.first();
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const download = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await btn.click();
    const d = await download;
    if (!d) return qa.gap("Export download", "clicking the primary action did not trigger a browser download within 15s (it may use the File System Access API)");
    expect(d.suggestedFilename().length).toBeGreaterThan(0);
    await qa.checkpoint("after-download", { checks: ["overflow", "clipping", "overlap"] });
  });

  test("soft keyboard with a text field in the dialog", async ({ qa, page }) => {
    test.skip(!qa.viewport.hasTouch && !qa.viewport.isMobile, "keyboard simulation applies to touch viewports");
    if (!(await openExport(qa))) return;
    const field = page.locator(`${SEL.exportModal} input[type=text], ${SEL.exportModal} input:not([type]), ${SEL.exportModal} input[type=number]`).first();
    if (!(await field.isVisible().catch(() => false))) return qa.gap("Export keyboard", "no text/number field in the export dialog");
    await withKeyboard(page, async (size) => {
      await field.focus();
      await field.scrollIntoViewIfNeeded();
      await settle(page);
      const b = await field.boundingBox();
      expect.soft(b && b.y + b.height, "field hidden behind the (simulated) keyboard").toBeLessThanOrEqual(size.height + 1);
      await qa.checkpoint("keyboard-open", { checks: ["overflow", "clipping"], baseline: false });
    });
  });
});
