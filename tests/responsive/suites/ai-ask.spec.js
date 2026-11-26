import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openOrGap, closeSurface, isVisible, settle } from "../helpers/suite-kit.js";
import { withKeyboard } from "../helpers/viewport.js";

// Mocked, signed-in backend: /api/auth/me, /api/ai/usage, /conversations, /chat (see helpers/network.js).
test.use({ authMode: "signed-in" });

async function openAi(qa) {
  const page = qa.page;
  // ?aiAsk=1 is the app's own deep link (App.jsx); fall back to the toggle control.
  if (await isVisible(page, SEL.aiPanel, 6000)) return true;
  return openOrGap(qa, "AI Ask", { selector: SEL.aiPanel, controls: [SEL.aiToggle, "button[aria-label='AI Ask']"] });
}

test.describe("I · AI Ask", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot({ query: "aiAsk=1" }); });

  test("opens, lays out and closes", async ({ qa, page }) => {
    if (!(await openAi(qa))) return;
    await expect(page.locator(SEL.aiPanel).first()).toBeVisible();
    await qa.checkpoint("ai-open", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    const closed = await closeSurface(page, { selector: SEL.aiPanel, closeControls: [SEL.aiClose, ".ai-ask-panel button[aria-label^='Close']"] });
    expect.soft(closed, "AI Ask did not close").toBe(true);
    await qa.checkpoint("ai-closed", { checks: ["overflow", "overlap"] });
  });

  test("provider selection", async ({ qa, page }) => {
    if (!(await openAi(qa))) return;
    const provider = page.locator(SEL.aiProvider).first();
    if (!(await provider.isVisible().catch(() => false))) return qa.gap("AI provider selection", "#ai-ask-provider not visible (may live behind a settings disclosure)");
    const values = await provider.locator("option").evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    for (const value of values.slice(0, 4)) {
      await provider.selectOption(value);
      await settle(page, { frames: 1 });
      await qa.checkpoint(`provider-${value}`, { checks: ["overflow", "clipping", "overlap", "text", "touch"] });
    }
  });

  test("long prompt keeps the composer visible", async ({ qa, page }) => {
    if (!(await openAi(qa))) return;
    const ta = page.locator(SEL.aiTextarea).first();
    await expect(ta).toBeVisible();
    await ta.fill(Array.from({ length: 40 }, (_, i) => `Line ${i + 1}: describe how the checkout service scales under load.`).join("\n"));
    await settle(page);
    const composer = await page.locator(SEL.aiComposer).first().boundingBox();
    expect.soft(composer && composer.y + composer.height, "composer pushed below the viewport by a long prompt").toBeLessThanOrEqual(qa.viewport.height + 1);
    await qa.checkpoint("long-prompt", { checks: ["overflow", "clipping", "overlap", "text"] });
  });

  test("response rendering and conversation scrolling", async ({ qa, page }) => {
    if (!(await openAi(qa))) return;
    await page.locator(SEL.aiTextarea).first().fill("Explain this architecture in detail.");
    const submit = page.locator(SEL.aiSubmit).first();
    await expect(submit).toBeVisible();
    await submit.click();
    const answer = page.locator(SEL.aiMessages).getByText(/long, deterministic answer/i).first();
    const shown = await answer.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
    if (!shown) return qa.gap("AI response rendering", "mocked answer did not render (the panel may require a different request contract)", { requests: [...qa.mocks.requests] });
    await settle(page);
    const info = await page.locator(SEL.aiMessages).first().evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight + 1, overflowY: getComputedStyle(el).overflowY }));
    expect.soft(info.scrollable ? /auto|scroll/.test(info.overflowY) : true, "long conversation is not scrollable").toBe(true);
    await qa.checkpoint("ai-response", { checks: ["overflow", "clipping", "overlap", "text", "touch", "layout"] });
    const composer = await page.locator(SEL.aiComposer).first().boundingBox();
    expect.soft(composer && composer.y + composer.height, "composer not visible after a long response").toBeLessThanOrEqual(qa.viewport.height + 1);
  });

  test("mobile keyboard: composer stays above the soft keyboard", async ({ qa, page }) => {
    test.skip(!qa.viewport.hasTouch && !qa.viewport.isMobile, "keyboard simulation applies to touch viewports");
    if (!(await openAi(qa))) return;
    await withKeyboard(page, async (size) => {
      const ta = page.locator(SEL.aiTextarea).first();
      await ta.focus();
      await settle(page);
      const b = await ta.boundingBox();
      expect.soft(b && b.y + b.height, "textarea hidden behind the (simulated) keyboard").toBeLessThanOrEqual(size.height + 1);
      expect.soft(b && b.y, "textarea scrolled above the viewport").toBeGreaterThanOrEqual(-1);
      await qa.checkpoint("keyboard-open", { checks: ["overflow", "clipping", "overlap"], baseline: false });
    });
  });
});
