import { test, expect } from "@playwright/test";

/**
 * Dock keyboard shortcuts: plain letters for primary tools, Alt+Shift+<key> for
 * every sub-tool. Direct activation works with the sub-dock closed and never
 * while typing. Run: npx --prefix e2e playwright test -c e2e/playwright.config.js e2e/keyboard-shortcuts.spec.js
 */
const DOCK = ".sketchizi-tool-sidebar";
const RAIL = `${DOCK} .sketchizi-tool-sidebar-child-rail`;

async function openCanvas(page) {
  await page.goto("/");
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
  await page.locator(".excalidraw canvas").first().click({ position: { x: 600, y: 400 } });
}
const activeTool = (page) => page.evaluate(() => document.querySelector(".sketchizi-tool-sidebar-active")?.getAttribute("aria-label") || "");

const PRIMARY = [["h", /Pan Canvas/], ["r", /Rectangle/], ["a", /Arrow/], ["p", /Fine Pencil/], ["t", /Text Block/], ["e", /Eraser/], ["v", /Select/]];
for (const [key, label] of PRIMARY) {
  test(`primary shortcut ${key.toUpperCase()} activates its tool`, async ({ page }) => {
    await openCanvas(page);
    await page.keyboard.press(key);
    await expect.poll(() => activeTool(page)).toMatch(label);
  });
}

test("Alt+Shift+U activates Rounded Rectangle with the sub-dock closed, and the rail highlights it", async ({ page }) => {
  await openCanvas(page);
  await expect(page.locator(RAIL)).toHaveCount(0);
  await page.keyboard.press("Alt+Shift+U");
  await expect.poll(() => activeTool(page)).toMatch(/Rounded Rectangle/);
  await page.locator(`${DOCK} .sketchizi-tool-sidebar-active`).hover();
  await page.locator(`${DOCK} .sketchizi-tool-sidebar-button[data-slot="shapes"]`).hover();
  await expect(page.locator(`${RAIL} [data-tool="rounded-rectangle"]`)).toHaveClass(/is-active/);
  await expect(page.locator(`${RAIL} [data-tool="rounded-rectangle"]`)).toHaveAttribute("data-tip", /Alt\+Shift\+U|⌥⇧U/);
});

test("Alt+Shift+Q and Alt+Shift+S pick Double / Dashed Arrow", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("Alt+Shift+Q");
  await expect.poll(() => activeTool(page)).toMatch(/Double Arrow/);
  await page.keyboard.press("Alt+Shift+S");
  await expect.poll(() => activeTool(page)).toMatch(/Dashed Arrow/);
});

test("shortcuts are ignored while typing in a field", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("v");
  await page.evaluate(() => { const i = document.createElement("input"); i.id = "tmp-input"; document.body.appendChild(i); i.focus(); });
  await page.keyboard.type("rap");
  await page.keyboard.press("Alt+Shift+R");
  await expect(page.locator("#tmp-input")).toHaveValue("rap");
  await expect.poll(() => activeTool(page)).toMatch(/Select/);
});

test("shortcuts are ignored during canvas text editing", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("t");
  await page.mouse.click(520, 320);
  await page.keyboard.type("rect");
  await expect(page.locator(".excalidraw-textEditorContainer textarea")).toHaveValue("rect");
});

test("Ctrl+R style browser shortcuts are not hijacked by plain tool keys", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("v");
  await page.keyboard.press("Control+a");
  await expect.poll(() => activeTool(page)).toMatch(/Select/);
});
