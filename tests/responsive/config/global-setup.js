import { chromium } from "../pw.js";

/**
 * Primes the Vite dev server (dependency pre-bundling triggers a one-off full
 * reload that would otherwise make the first few tests flaky) and verifies the
 * app boots at all before 14 x 15 tests are scheduled.
 */
export default async function globalSetup(config) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["127.0.0.1", "localhost"].includes(url.hostname) && !url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return route.abort();
    });
    await page.goto(`${baseURL}/?editor=1`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator(".app, .startup-canvas-chooser").first().waitFor({ state: "visible", timeout: 90_000 });
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".app, .startup-canvas-chooser").first().waitFor({ state: "visible", timeout: 60_000 });
  } finally {
    await browser.close();
  }
}
