import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  for (const width of [1440, 768, 390]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const body = path === '/api/auth/me'
          ? { authenticated: true, user: { name: 'Account layout regression user with a long name', email: 'long-account-name@example.com' } }
          : path === '/api/auth/providers' ? { google: true, github: true }
          : { connected: false, authorizationAvailable: true };
        await route.fulfill({ json: body });
      });
      await page.goto(`${process.env.SKETCHIZI_BASE_URL || 'http://127.0.0.1:4173'}/?editor=1`);
      const trigger = page.locator('.auth-account-trigger:visible');
      await trigger.waitFor();
      await page.locator('.app').evaluate((app, theme) => {
        app.classList.remove('theme-light', 'theme-dark');
        app.classList.add(`theme-${theme}`);
      }, theme);
      const before = await trigger.boundingBox();
      await trigger.click();
      const menu = page.getByRole('menu', { name: 'Account menu' });
      await menu.waitFor();
      const after = await trigger.boundingBox();
      assert.deepEqual(after, before, 'Opening the menu must not move or resize the avatar');
      const bounds = await menu.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Menu must fit horizontally');
      assert(bounds.y >= before.y + before.height && bounds.y + bounds.height <= 900, 'Menu must open below the avatar inside the viewport');
      assert.equal(await menu.evaluate(el => getComputedStyle(el).position), 'absolute');
      await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await menu.count(), 0, 'Escape closes the account menu');
      await trigger.click();
      await page.mouse.click(20, 450);
      assert.equal(await menu.count(), 0, 'Clicking the canvas closes the account menu');
      console.log(`PASS: account dropdown ${width}px ${theme}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
