import { test, expect } from "../fixtures/responsive.fixture.js";
import { viewportClassFor } from "../config/viewports.js";
import { SEL, isVisible, openCommand, settle } from "../helpers/suite-kit.js";
import { resizeTo, rotate, readSafeArea, viewportMeta } from "../helpers/viewport.js";

test.describe("A · Global application shell", () => {
  test("app loads with header, canvas and no horizontal overflow", async ({ qa, page }) => {
    await qa.boot();
    await expect(page.locator(SEL.app).first()).toBeVisible();
    await expect(page.locator(SEL.excalidraw).first()).toBeVisible();
    const islands = await page.locator(SEL.headerIslands).count();
    const header = await page.locator(SEL.header).count();
    expect.soft(islands + header, "no header / navigation chrome rendered").toBeGreaterThan(0);
    await qa.checkpoint("loaded");
  });

  test("data-viewport attribute follows the width contract", async ({ qa, page }) => {
    await qa.boot();
    const attr = await page.evaluate(() => document.documentElement.dataset.viewport);
    expect(attr).toBe(viewportClassFor(qa.viewport.width));
    const input = await page.evaluate(() => document.documentElement.dataset.input);
    if (qa.viewport.hasTouch && input !== "coarse") {
      qa.record({ category: "layout", severity: "P3", message: `Touch viewport reports data-input="${input}" (expected "coarse"); coarse-pointer sizing rules may not apply.`, selector: "html" }, "viewport-contract");
    }
    await qa.checkpoint("viewport-contract", { checks: ["overflow", "layout"] });
  });

  test("navigation: command palette opens and closes", async ({ qa, page }) => {
    await qa.boot();
    await page.keyboard.press("ControlOrMeta+K");
    const palette = page.locator(SEL.commandPalette).first();
    await expect(palette).toBeVisible();
    await qa.checkpoint("command-palette-open");
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("workspace switching: editor -> Kubernetes Studio -> editor", async ({ qa, page }) => {
    await qa.boot();
    await openCommand(page, "Open Kubernetes Studio");
    const studio = page.locator(".k8s-studio").first();
    if (!(await isVisible(page, ".k8s-studio", 8000))) return qa.gap("Workspace switching", "Kubernetes Studio did not open from the command palette");
    await qa.checkpoint("studio-open");
    await page.locator("button[aria-label='Close K8s Studio']").first().click();
    await expect(studio).toBeHidden();
    await expect(page.locator(SEL.excalidraw).first()).toBeVisible();
    await qa.checkpoint("back-to-editor");
  });

  test("sidebar / dock visibility matches the viewport class", async ({ qa, page }) => {
    await qa.boot();
    const dock = page.locator(SEL.primaryDock).first();
    if (!(await dock.isVisible().catch(() => false))) return qa.gap("Primary dock", "not visible in the default shell");
    const box = await dock.boundingBox();
    expect.soft(box.x, "dock starts off-screen").toBeGreaterThanOrEqual(-1);
    expect.soft(box.x + box.width, "dock extends past the right edge").toBeLessThanOrEqual(qa.viewport.width + 1);
    await qa.checkpoint("dock-visibility");
  });

  test("viewport resizing keeps the shell intact (320 -> 768 -> 1280)", async ({ qa, page }) => {
    await qa.boot();
    for (const [w, h] of [[320, 568], [768, 1024], [1280, 800], [qa.viewport.width, qa.viewport.height]]) {
      await resizeTo(page, w, h);
      await expect(page.locator(SEL.excalidraw).first()).toBeVisible();
      const attr = await page.evaluate(() => document.documentElement.dataset.viewport);
      expect.soft(attr, `data-viewport after resize to ${w}`).toBe(viewportClassFor(w));
      await qa.checkpoint(`resized-${w}x${h}`, { checks: ["overflow", "clipping", "overlap"] });
    }
  });

  test("orientation change (portrait <-> landscape)", async ({ qa, page }) => {
    await qa.boot();
    const first = await rotate(page);
    await expect(page.locator(SEL.excalidraw).first()).toBeVisible();
    const orientation = await page.evaluate(() => document.documentElement.dataset.orientation);
    expect.soft(orientation).toBe(first.width > first.height ? "landscape" : "portrait");
    await qa.checkpoint("rotated", { checks: ["overflow", "clipping", "overlap", "layout"] });
    await rotate(page);
    await qa.checkpoint("rotated-back", { checks: ["overflow", "clipping"] });
  });

  test("safe-area handling", async ({ qa, page }) => {
    await qa.boot();
    const meta = await viewportMeta(page);
    const inset = await readSafeArea(page);
    if (qa.viewport.hasTouch && !(meta || "").includes("viewport-fit=cover")) {
      qa.record({ category: "layout", severity: "P3", message: `Viewport meta lacks viewport-fit=cover (${meta}); env(safe-area-inset-*) will be 0 on notched devices.`, selector: "meta[name=viewport]", details: { meta, inset } }, "safe-area");
    }
    // Headless Chromium has no insets; assert the CSS at least does not break with env() = 0.
    expect(inset.top).toBeGreaterThanOrEqual(0);
    await qa.checkpoint("safe-area", { checks: ["overflow", "clipping"] });
  });
});
