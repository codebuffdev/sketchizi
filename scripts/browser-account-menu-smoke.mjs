import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  for (const width of [1440, 768, 390]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      console.log(`Checking account dropdown at ${width}px in ${theme} theme`);
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const body = path === '/api/auth/me'
          ? { authenticated: true, user: { name: 'Account layout regression user with a long name', email: 'long-account-name@example.com' } }
          : path === '/api/auth/providers' ? { google: true, github: true }
          : { connected: false, authorizationAvailable: true };
        await route.fulfill({ json: body });
      });
      await page.goto(`${process.env.SKETCHIZI_BASE_URL || 'http://127.0.0.1:4173'}/?editor=1`);
      const chooser = page.getByRole('dialog').filter({
        has: page.getByRole('heading', { name: 'Start with' }),
      });
      await chooser.getByRole('button', { name: 'Infinity' }).click();
      await chooser.waitFor({ state: 'detached' });

      const header = page.locator('.desktop-app-header');
      if (width >= 1025 || (width >= 521 && width < 1025)) {
        await page.keyboard.press('Control+Shift+H');
      }
      if (width >= 521) {
        const pin = header.locator('.desktop-app-header-pin-button');
        if (await pin.count()) {
          if (await pin.getAttribute('aria-pressed') !== 'true') await pin.click({ force: true });
          await pin.waitFor({ state: 'attached' });
        }
      }

      const trigger = header.getByRole('button', { name: 'Open account menu' });
      await trigger.waitFor();
      await page.locator('.app').evaluate((app, theme) => {
        app.classList.remove('theme-light', 'theme-dark');
        app.classList.add(`theme-${theme}`);
      }, theme);
      // Let the header finish moving and scroll the trigger into view before measuring.
      await trigger.click({ trial: true });
      const before = await trigger.boundingBox();
      await trigger.click();
      const menu = page.getByRole('menu', { name: 'Account menu' });
      await menu.waitFor();
      const after = await trigger.boundingBox();
      assert.deepEqual(after, before, 'Opening the menu must not move or resize the avatar');
      const bounds = await menu.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Menu must fit horizontally');
      assert(bounds.y >= 0 && bounds.y + bounds.height <= 900, 'Menu must fit vertically');
      if (width >= 1025) {
        assert(bounds.x + bounds.width <= before.x, 'Menu must open to the left of the desktop rail');
      } else {
        assert(bounds.y >= before.y + before.height, 'Menu must open below the avatar');
      }
      await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).press('Escape');
      await menu.waitFor({ state: 'detached' });
      await trigger.click();
      await page.mouse.click(20, 450);
      await menu.waitFor({ state: 'detached' });
      console.log(`PASS: account dropdown ${width}px ${theme}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
