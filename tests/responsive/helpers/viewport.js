/**
 * Viewport utilities: resize, orientation, safe-area, visualViewport/keyboard.
 */
export async function settle(page, { frames = 2, timeout = 1500 } = {}) {
  await page.evaluate(
    async ({ frames, timeout }) => {
      const start = performance.now();
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      for (let i = 0; i < frames; i++) await raf();
      while (performance.now() - start < timeout) {
        const running = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations !== Infinity) : [];
        if (!running.length) break;
        await raf();
      }
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
    },
    { frames, timeout },
  );
}

export async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  await settle(page);
}

/** Swap width/height (orientation change) and wait for the layout to settle. */
export async function rotate(page) {
  const size = page.viewportSize();
  await resizeTo(page, size.height, size.width);
  return { width: size.height, height: size.width };
}

/**
 * Approximates the soft keyboard: shrinks the layout viewport height to ~55%.
 * Headless Chromium cannot show a real IME keyboard; resizing fires the same
 * `resize` + `visualViewport.resize` events apps listen for, but CSS 100vh does
 * NOT shrink on a real device, so dvh/vh divergence is reported statically
 * (see layout.js) rather than reproduced here.
 */
export async function withKeyboard(page, fn, { ratio = 0.55 } = {}) {
  const original = page.viewportSize();
  const height = Math.round(original.height * ratio);
  await resizeTo(page, original.width, height);
  try {
    return await fn({ width: original.width, height });
  } finally {
    await resizeTo(page, original.width, original.height);
  }
}

/** Reads env(safe-area-inset-*) through a probe element. */
export async function readSafeArea(page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    return out;
  });
}

/** Does the document declare viewport-fit=cover (needed for safe-area insets to be non-zero)? */
export async function viewportMeta(page) {
  return page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") || null);
}
