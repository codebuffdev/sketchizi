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
test("document dropdown opens Export Studio with a live System Design preview while hamburger stays clean", async ({ page }) => {
  await openCanvas(page);

  const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";
  await page.keyboard.press(shortcut);
  const palette = page.locator(".sketchizi-command-palette");
  await expect(palette).toBeVisible();
  await page.keyboard.type("system design");
  await palette.getByText(/Open System Design Studio/i).click();

  const studio = page.getByTestId("system-design-studio");
  await expect(studio).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "System design workspace" });
  await toolbar.getByRole("button", { name: "Blueprints" }).click();
  const blueprintMenu = page.getByRole("menu", { name: "Starter architectures" });
  await expect(blueprintMenu.getByRole("menuitem").first()).toBeVisible();
  await blueprintMenu.getByRole("menuitem").first().click();

  await expect(studio.locator("[data-node-id]").first()).toBeVisible();
  await page.getByRole("button", { name: "Canvas options" }).click();
  const canvasOptions = page.getByRole("dialog", { name: "Canvas options" });
  await expect(canvasOptions.getByText("Recovery backup")).toBeVisible();
  await expect(canvasOptions.getByText("Export studio...")).toBeVisible();
  await canvasOptions.getByRole("button", { name: "Export studio" }).click();

  const exportStudio = page.getByRole("dialog", { name: "Export Studio" });
  await expect(exportStudio).toBeVisible();
  await expect(exportStudio.getByText("Diagram preview")).toBeVisible();
  await expect(exportStudio.locator(".sketchizi-system-export-preview svg [data-node-id]").first()).toBeVisible();
  await expect(exportStudio.getByRole("button", { name: "Download PNG" })).toBeVisible();
  await expect(exportStudio.getByRole("button", { name: "Download SVG" })).toBeVisible();
  await exportStudio.getByRole("button", { name: "Close export studio" }).click();

  await page.getByRole("button", { name: "Open application menu" }).click();
  const nativeMenu = page.locator(".dropdown-menu-container").first();
  await expect(nativeMenu).toBeVisible();
  await expect(nativeMenu.getByText("Export image...", { exact: true })).toHaveCount(0);
  await expect(nativeMenu.getByText("Find on canvas", { exact: true })).toHaveCount(0);
  await expect(nativeMenu.getByText("Reset canvas", { exact: true })).toBeVisible();
});
