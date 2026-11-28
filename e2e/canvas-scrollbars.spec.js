import { test, expect } from "@playwright/test";

/**
 * Content-bounded floating scrollbars: hidden when empty / fitting, hover-revealed when
 * the drawing overflows. Run: npx --prefix e2e playwright test -c e2e/playwright.config.js e2e/canvas-scrollbars.spec.js
 */
const V = '.sketchizi-scrollzone[data-axis="vertical"]';
const H = '.sketchizi-scrollzone[data-axis="horizontal"]';

async function openCanvas(page) {
  await page.goto("/");
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
}
async function drawRect(page, from, to) {
  await page.keyboard.press("r");
  await page.mouse.move(...from); await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 }); await page.mouse.up();
}

test("empty canvas: neither scrollbar is displayed, and hovering the edges reveals nothing", async ({ page }) => {
  await openCanvas(page);
  await expect(page.locator(V)).toBeHidden();
  await expect(page.locator(H)).toBeHidden();
  await page.mouse.move(1438, 450);
  await page.mouse.move(720, 898);
  await expect(page.locator(V)).toBeHidden();
  await expect(page.locator(".sketchizi-scroll-percent, .sketchizi-scroll-step")).toHaveCount(0);
});

test("a drawing that fits the viewport keeps both scrollbars hidden", async ({ page }) => {
  await openCanvas(page);
  await drawRect(page, [500, 300], [700, 420]);
  await expect(page.locator(V)).toBeHidden();
  await expect(page.locator(H)).toBeHidden();
});

test("an overflowing drawing shows a vertical pill only on edge hover, widening under the pointer", async ({ page }) => {
  await openCanvas(page);
  await drawRect(page, [500, 150], [700, 250]);
  // Zoom out/pan so the artwork overflows: draw a very tall shape.
  await drawRect(page, [800, 100], [900, 880]);
  await page.keyboard.press("Control+="); await page.keyboard.press("Control+="); await page.keyboard.press("Control+=");
  const zone = page.locator(V);
  await expect(zone).toBeVisible();
  const thumb = zone.locator(".sketchizi-scroll-thumb");
  await expect(thumb).toHaveCSS("opacity", "0"); // clean at rest
  await page.mouse.move(1432, 450); // inside the 22px edge hit-zone
  await expect(thumb).toHaveCSS("opacity", "1");
  const box = await thumb.boundingBox();
  expect(Math.round(box.width)).toBe(5);
  await thumb.hover();
  await expect.poll(async () => Math.round((await thumb.boundingBox()).width)).toBe(8);
});

test("wheel scrolling briefly wakes the thumb, then it fades after ~900ms", async ({ page }) => {
  await openCanvas(page);
  await drawRect(page, [800, 100], [900, 880]);
  await page.keyboard.press("Control+="); await page.keyboard.press("Control+="); await page.keyboard.press("Control+=");
  const thumb = page.locator(`${V} .sketchizi-scroll-thumb`);
  await page.mouse.move(600, 450);
  await page.mouse.wheel(0, 200);
  await expect(page.locator(V)).toHaveClass(/is-awake/);
  await expect(page.locator(V)).not.toHaveClass(/is-awake/, { timeout: 3000 });
  await expect(thumb).toHaveCSS("opacity", "0");
});
