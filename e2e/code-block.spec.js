import { test, expect } from "@playwright/test";

/**
 * Code Block tool: flyout entry, "C" shortcut, click-to-place, editor
 * keybindings, language badge and canvas rendering.
 * Run: npx playwright test e2e/code-block.spec.js
 */
const DOCK = ".sketchizi-tool-sidebar";
const EDITOR = '[data-testid="code-block-editor"]';

async function openCanvas(page) {
  await page.goto("/");
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
}

async function placeCard(page) {
  await page.keyboard.press("c");
  await page.mouse.click(600, 300);
  await expect(page.locator(EDITOR)).toBeVisible();
}

test("T flyout lists Text, Sticky Note and Code Block (C)", async ({ page }) => {
  await openCanvas(page);
  await page.locator(`${DOCK} .sketchizi-tool-sidebar-active`).hover();
  await page.locator(`${DOCK} .sketchizi-tool-sidebar-button[data-slot="text"]`).hover();
  const rail = page.locator(`${DOCK} .sketchizi-tool-sidebar-child-rail`);
  await expect(rail.locator("button")).toHaveCount(3);
  await expect(rail.locator('[data-tool="code-block"]')).toHaveAttribute("data-tip", "Code Block (C)");
});

test("C places an editable test.ts card with a TS badge", async ({ page }) => {
  await openCanvas(page);
  await placeCard(page);
  await expect(page.locator(`${EDITOR} .sk-code-editor__filename`)).toHaveValue("test.ts");
  await expect(page.locator('[data-testid="code-block-badge"]')).toHaveText("TS");
  const card = await page.locator(`${EDITOR} .sk-code-editor__card`).boundingBox();
  expect(card.width).toBeGreaterThanOrEqual(280);
  expect(card.height).toBeGreaterThanOrEqual(160);
  await expect(page.locator(`${EDITOR} textarea`)).toBeFocused();
});

test("Tab, Enter auto-indent and extension-driven badge", async ({ page }) => {
  await openCanvas(page);
  await placeCard(page);
  const area = page.locator(`${EDITOR} textarea`);
  await area.pressSequentially("function f() {");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await area.pressSequentially("return 1;");
  await expect(area).toHaveValue("function f() {\n    return 1;");
  await page.keyboard.press("Shift+Tab");
  await expect(area).toHaveValue("function f() {\n  return 1;");
  const name = page.locator(`${EDITOR} .sk-code-editor__filename`);
  await name.fill("Main.java");
  await expect(page.locator('[data-testid="code-block-badge"]')).toHaveText("JAVA");
  await name.fill("q.sql");
  await expect(page.locator('[data-testid="code-block-badge"]')).toHaveText("SQL");
});

test("committing leaves an image element carrying the code; Copy yields the raw string", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openCanvas(page);
  await placeCard(page);
  await page.locator(`${EDITOR} textarea`).pressSequentially("const a = 1;");
  await page.locator(`${EDITOR} .sk-code-editor__copy`).click();
  await expect(page.locator(`${EDITOR} .sk-code-editor__copy`)).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("const a = 1;");
  await page.keyboard.press("Escape");
  await expect(page.locator(EDITOR)).toHaveCount(0);
  await page.mouse.move(640, 340);
  await expect(page.locator('[data-testid="code-block-copy"]')).toBeVisible();
});
