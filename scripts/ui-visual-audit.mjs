import path from "node:path";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const baseURL = process.env.SKETCHIZI_BASE_URL || process.env.STAGING_BASE_URL;
const outputDir = path.resolve(process.env.UI_VISUAL_OUTPUT_DIR || "artifacts/ui-visual-audit");

export function validateVisualAuditUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Visual audit URL must be an absolute HTTP(S) URL."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Visual audit URL must use HTTP(S) and must not contain embedded credentials.");
  }
  return parsed;
}

export async function runUiVisualAudit({ url = baseURL, playwright, screenshotsDir = outputDir } = {}) {
  if (!url) throw new Error("Set SKETCHIZI_BASE_URL or STAGING_BASE_URL to the deployed app URL.");
  const parsedURL = validateVisualAuditUrl(url);
  await mkdir(screenshotsDir, { recursive: true });
  const browserTool = playwright || (await import("playwright")).chromium;
  const browser = await browserTool.launch({ headless: true });
  const failures = [];
  const checks = [];
  const snapshots = [];
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "laptop", width: 1280, height: 800 },
    { name: "split-screen-1024", width: 1024, height: 900 },
    { name: "compact-desktop-900", width: 900, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
    { name: "mobile-landscape", width: 844, height: 390 },
  ];
  const contexts = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      contexts.push(context);
      const page = await context.newPage();
      page.on("pageerror", error => failures.push(`${viewport.name}: page error: ${error.message}`));
      page.on("console", message => { if (message.type() === "error") failures.push(`${viewport.name}: console error: ${message.text()}`); });
      page.on("requestfailed", request => {
        try {
          if (new URL(request.url()).origin === parsedURL.origin) failures.push(`${viewport.name}: failed same-origin request: ${request.url()}`);
        } catch {}
      });
      await page.goto(parsedURL.href, { waitUntil: "networkidle", timeout: 60000 });
      await page.locator("#root").waitFor({ state: "visible", timeout: 15000 });
      await page.screenshot({ path: path.join(screenshotsDir, `${viewport.name}-creation.png`), fullPage: true, animations: "disabled" });
      snapshots.push(`${viewport.name}-creation.png`);
      const dimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportHeight: document.documentElement.clientHeight,
        documentHeight: document.documentElement.scrollHeight,
      }));
      if (dimensions.documentWidth > dimensions.viewportWidth + 1) {
        failures.push(`${viewport.name}: creation screen horizontal overflow (${dimensions.documentWidth}px document / ${dimensions.viewportWidth}px viewport)`);
      }
      checks.push(`${viewport.name}: creation screen rendered without horizontal overflow`);

      if (viewport.name === "desktop" || viewport.name === "mobile") {
        await page.getByRole("button", { name: /create a new design/i }).click();
        await page.getByRole("heading", { name: "What are you designing?" }).waitFor();
        await page.getByRole("button", { name: "Start blank" }).click();
        await page.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
        await page.locator(".excalidraw").waitFor({ timeout: 30000 });
        await page.screenshot({ path: path.join(screenshotsDir, `${viewport.name}-editor.png`), fullPage: true, animations: "disabled" });
        snapshots.push(`${viewport.name}-editor.png`);
        const editorOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        if (editorOverflow) failures.push(`${viewport.name}: editor has horizontal document overflow`);
        checks.push(`${viewport.name}: blank editor rendered without horizontal document overflow`);
      }
    }
    if (failures.length) throw new Error(failures.join("\n"));
    const report = { status: "passed", url: `${parsedURL.origin}${parsedURL.pathname}`, checks, snapshots, failures };
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## UI visual audit\n\n- Status: **${report.status}**\n- Target: ${report.url}\n${checks.map(item => `- ${item}`).join("\n")}\n\nScreenshots: ${snapshots.join(", ")}\n`);
    }
    return report;
  } catch (error) {
    const report = { status: "failed", url: `${parsedURL.origin}${parsedURL.pathname}`, checks, snapshots, failures: [...failures, error.message] };
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(screenshotsDir, "ui-visual-audit-report.json"), JSON.stringify(report, null, 2)));
    throw error;
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    await browser.close();
  }
}

async function main() {
  const report = await runUiVisualAudit();
  console.log("Sketchizi UI visual audit passed.");
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Sketchizi UI visual audit failed: ${error.message}`); process.exitCode = 1; });
}
