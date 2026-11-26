import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openCommand, isVisible, settle } from "../helpers/suite-kit.js";
import { resizeTo } from "../helpers/viewport.js";

/**
 * Studios are DISCOVERED from the command palette rather than assumed:
 * every command whose label matches /studio/i is recorded; the three that
 * the registry defines (Kubernetes, Docker Compose, System Design) are then
 * opened, laid out and closed. Anything else found is reported as an
 * informational finding so new studios show up in the next report.
 */
const KNOWN = [
  { command: "Open Kubernetes Studio", root: ".k8s-studio", close: "button[aria-label='Close K8s Studio']", name: "Kubernetes Studio" },
  { command: "Open Docker Compose Studio", root: ".docker-studio", close: "button[aria-label='Close Docker Compose Studio']", name: "Docker Compose Studio" },
  { command: "Open System Design Studio", root: SEL.systemDesignStudio, close: "[data-testid='system-design-studio'] button[aria-label*='Close' i], button:has-text('Close System Design')", name: "System Design Studio" },
];

test.describe("M · Studios", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("discover available studios from the command palette", async ({ qa, page }) => {
    await page.keyboard.press("ControlOrMeta+K");
    const palette = page.locator(SEL.commandPalette).first();
    await expect(palette).toBeVisible();
    const input = palette.locator("input").first();
    if (await input.isVisible().catch(() => false)) await input.fill("studio");
    await settle(page);
    const labels = await palette.evaluate((el) => [...el.querySelectorAll("button, [role=option], li")].map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => /studio/i.test(t)).map((t) => t.slice(0, 70)));
    const unique = [...new Set(labels)];
    qa.record({ category: "coverage-gap", severity: "P3", message: `Discovered studio commands: ${unique.join(" | ") || "(none)"}`, details: { studios: unique } }, "discovery");
    expect(unique.length, "no studio commands discovered").toBeGreaterThan(0);
    await qa.checkpoint("palette-studio-search", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });

  for (const studio of KNOWN) {
    test(`${studio.name}: open, lay out, resize, close`, async ({ qa, page }) => {
      await openCommand(page, studio.command).catch(() => {});
      if (!(await isVisible(page, studio.root, 10_000))) return qa.gap(studio.name, `did not open from "${studio.command}" at ${qa.viewport.id}`);
      await qa.checkpoint(`${studio.name}-open`.toLowerCase().replace(/\s+/g, "-"), { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });

      // Responsive resize while the studio is open (narrow then back).
      const original = page.viewportSize();
      await resizeTo(page, Math.max(320, Math.min(original.width, 600)), original.height);
      await qa.checkpoint(`${studio.name}-narrow`.toLowerCase().replace(/\s+/g, "-"), { checks: ["overflow", "clipping", "touch", "text"], baseline: false });
      await resizeTo(page, original.width, original.height);

      const close = page.locator(studio.close).first();
      if (await close.isVisible().catch(() => false)) {
        await close.click();
        await expect(page.locator(studio.root).first()).toBeHidden({ timeout: 8000 });
      } else {
        await page.keyboard.press("Escape");
        if (await isVisible(page, studio.root)) qa.gap(`${studio.name} close`, "no visible close control and Escape did not close it");
      }
    });
  }
});
