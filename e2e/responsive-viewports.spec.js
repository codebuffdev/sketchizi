import { test, expect } from "@playwright/test";

// Verifies the seven required viewports against the REAL app.
// Run: npm run test:e2e -- responsive-viewports
const VIEWPORTS = [
  { name: "ultra-wide 2560x1440", width: 2560, height: 1440, touch: false },
  { name: "laptop 1366x768", width: 1366, height: 768, touch: false },
  { name: "laptop 1440x900", width: 1440, height: 900, touch: false },
  { name: "iPad portrait 768x1024", width: 768, height: 1024, touch: true },
  { name: "iPad landscape 1024x768", width: 1024, height: 768, touch: true },
  { name: "phone 375x812", width: 375, height: 812, touch: true },
  { name: "phone 430x932", width: 430, height: 932, touch: true },
];

async function openCanvas(page) {
  await page.goto("/");
  // First visit shows a "Start with" chooser; pick the infinite canvas.
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
}

const FLOATING = [
  ".desktop-app-header-island",
  ".sketchizi-tool-sidebar",
  ".sketchizi-tool-options-dock",
  ".properties-toggle",
  ".minimap",
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.touch && vp.width < 768,
    });

    test("no horizontal overflow, full-bleed canvas, floating UI inside viewport", async ({ page }) => {
      await openCanvas(page);
      await page.waitForTimeout(500);

      const m = await page.evaluate((floating) => {
        const vw = innerWidth, vh = innerHeight;
        const canvas = document.querySelector(".canvas").getBoundingClientRect();
        const boxes = floating.flatMap((sel) => {
          const el = document.querySelector(sel);
          if (!el) return [];
          const cs = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (cs.display === "none" || cs.visibility === "hidden" || !b.width || !b.height) return [];
          if (cs.position !== "fixed" && cs.position !== "absolute") return [];
          return [{ sel, l: b.left, t: b.top, r: b.right, b: b.bottom }];
        });
        const outside = boxes.filter((x) => x.l < -0.5 || x.t < -0.5 || x.r > vw + 0.5 || x.b > vh + 0.5).map((x) => x.sel);
        const overlaps = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) overlaps.push(`${a.sel} x ${c.sel}`);
        }
        return {
          scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, vw,
          canvasW: canvas.width, canvasH: canvas.height, vh,
          touchAction: getComputedStyle(document.querySelector(".canvas")).touchAction,
          viewport: document.documentElement.dataset.viewport, outside, overlaps,
        };
      }, FLOATING);

      expect(m.scrollW, "documentElement horizontal overflow").toBeLessThanOrEqual(m.vw);
      expect(m.bodyScrollW, "body horizontal overflow").toBeLessThanOrEqual(m.vw);
      expect(Math.round(m.canvasW)).toBe(m.vw);
      expect(m.canvasH).toBeLessThanOrEqual(m.vh + 1);
      expect(m.touchAction).toBe("none");
      expect(m.outside, "clipped floating UI").toEqual([]);
      expect(m.overlaps, "overlapping floating UI").toEqual([]);
      expect(m.viewport).toBe(vp.width < 768 ? "phone" : vp.width < 1024 ? "tablet" : "desktop");
    });

    if (vp.touch) {
      test("dock trigger toggles on tap and tools keep the 32px design size", async ({ page }) => {
        await openCanvas(page);
        const dock = page.locator(".sketchizi-tool-sidebar").first();
        await dock.waitFor({ timeout: 20_000 });
        const trigger = dock.locator(".sketchizi-tool-sidebar-active").first();
        await trigger.tap();
        await expect(dock).toHaveClass(/is-expanded/);
        const sizes = await dock.locator(".sketchizi-tool-sidebar-list .sketchizi-tool-sidebar-button").evaluateAll(
          (els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }),
        );
        // 32px visuals by design (brief); coarse pointers get a 36px hit area via ::before.
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(32);
        await dock.locator(".sketchizi-tool-sidebar-expand").tap();
        await expect(dock).not.toHaveClass(/is-expanded/);
      });
    }
  });
}
