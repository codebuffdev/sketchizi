import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseURL = process.env.SKETCHIZI_BASE_URL || process.env.STAGING_BASE_URL;
if (!baseURL) throw new Error("Set SKETCHIZI_BASE_URL or STAGING_BASE_URL to the deployed app URL.");
let parsedURL;
try { parsedURL = new URL(baseURL); } catch { throw new Error("Browser acceptance URL must be an absolute HTTP(S) URL."); }
if (!["http:", "https:"].includes(parsedURL.protocol) || parsedURL.username || parsedURL.password) {
  throw new Error("Browser acceptance URL must use HTTP(S) and must not contain embedded credentials.");
}

export async function runBrowserAcceptance({ url = baseURL, playwright = chromium } = {}) {
  const browser = await playwright.launch({ headless: true });
  const failures = [];
  const results = [];
  const contexts = [];
  const attachDiagnostics = async (viewport, label) => {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(`${label} page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`${label} console error: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      const requestUrl = request.url();
      try {
        if (new URL(requestUrl).origin === new URL(url).origin) failures.push(`${label} failed same-origin request: ${requestUrl} (${request.failure()?.errorText || "unknown"})`);
      } catch {}
    });
    return page;
  };

  try {
    const page = await attachDiagnostics({ width: 1440, height: 1000 }, "desktop");
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#root").waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: /create a new design/i }).click();
    await page.getByRole("heading", { name: "What are you designing?" }).waitFor();
    await page.getByRole("tab", { name: "AWS architecture" }).click();
    await page.getByRole("button", { name: /Three-Tier AWS Web Application/i }).click();
    await page.getByRole("checkbox", { name: /Configure first/i }).check();
    await page.getByLabel("Design name").fill("Staging Acceptance Architecture");
    await page.getByLabel("AWS region").selectOption("ap-south-1");
    await page.getByLabel("Environment").selectOption("staging");
    await page.getByRole("button", { name: /Use template/i }).click();
    await page.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
    await page.locator(".excalidraw").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /Open application menu/i }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menu", { name: "File menu" }).getByRole("menuitem", { name: /Save/i }).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "File", exact: true }).click();
    results.push("configured template opens the editor and File menu is available");

    const blank = await attachDiagnostics({ width: 1280, height: 800 }, "blank-canvas");
    await blank.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await blank.getByRole("button", { name: /create a new design/i }).click();
    await blank.getByRole("heading", { name: "What are you designing?" }).waitFor();
    await blank.getByRole("button", { name: "Start blank" }).click();
    await blank.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
    await blank.locator(".excalidraw").waitFor({ timeout: 30000 });
    results.push("blank-canvas journey opens the editor");

    const narrow = await attachDiagnostics({ width: 390, height: 844 }, "narrow-viewport");
    await narrow.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await narrow.getByRole("button", { name: /create a new design/i }).click();
    await narrow.getByRole("heading", { name: "What are you designing?" }).waitFor();
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) failures.push("narrow viewport has horizontal overflow at 390px");
    results.push("creation screen fits a 390px viewport");

    if (failures.length) throw new Error(failures.join("\n"));
    return { status: "passed", url: `${new URL(url).origin}${new URL(url).pathname}`, checks: results };
  } catch (error) {
    const firstPage = contexts[0]?.pages()[0];
    if (firstPage && process.env.BROWSER_ACCEPTANCE_SCREENSHOT) {
      await firstPage.screenshot({ path: process.env.BROWSER_ACCEPTANCE_SCREENSHOT, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
  }
}

async function main() {
  const report = await runBrowserAcceptance();
  console.log("Sketchizi browser acceptance passed.");
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Browser acceptance\n\n- Status: **${report.status}**\n- URL: ${report.url}\n${report.checks.map((check) => `- ${check}`).join("\n")}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Browser acceptance failed: ${error.message}`); process.exitCode = 1; });
}
