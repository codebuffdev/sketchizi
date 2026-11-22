import { test, expect } from "@playwright/test";

const IGNORED_ERRORS = [/Failed to load resource/i, /\/api\//i, /favicon/i, /ResizeObserver loop/i];

async function openCanvas(page) {
  await page.goto("/");
  // First visit shows a "Start with" chooser; pick the infinite canvas.
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
}

test("loads without crashing and shows the canvas and header", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !IGNORED_ERRORS.some((re) => re.test(msg.text()))) pageErrors.push(msg.text());
  });

  await openCanvas(page);

  await expect(page.locator(".desktop-app-header, header").first()).toBeVisible();
  await expect(page.locator("main.canvas")).toBeVisible();
  // Canvas is the hero: no studio or formatting surface is open on first load.
  await expect(page.locator(".sketchizi-tool-options-dock.is-open")).toHaveCount(0);
  await expect(page.locator(".sketchizi-more-tools-menu")).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});

test("Tool menu is the single quiet launcher for studios and cloud icons", async ({ page }) => {
  await openCanvas(page);
  await page.getByRole("button", { name: "Tool", exact: true }).click();
  const menu = page.locator(".sketchizi-more-tools-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("[data-more-tools-studio=cloud-icons]")).toBeVisible();
  await expect(menu.locator("[data-more-tools-studio=kubernetes]")).toBeVisible();
  await expect(menu.locator("[data-more-tools-studio=docker]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("Ctrl+K finds Kubernetes Studio, Docker Compose Studio and the icon library", async ({ page }) => {
  await openCanvas(page);
  const combo = process.platform === "darwin" ? "Meta+K" : "Control+K";
  for (const [query, label] of [["kubernetes", /Kubernetes Studio/i], ["docker", /Docker Compose Studio/i], ["cloud icons", /Icon Library/i]]) {
    await page.keyboard.press(combo);
    const palette = page.locator(".sketchizi-command-palette");
    await expect(palette).toBeVisible();
    await page.keyboard.type(query);
    await expect(palette.getByText(label).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  }
});
