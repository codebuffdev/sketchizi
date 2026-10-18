import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const serverScript = path.join(scriptDirectory, "workbench-browser-test-server.mjs");
const port = Number(process.env.WORKBENCH_TEST_PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WORKBENCH_TEST_PORT must be an integer between 1 and 65535");
}

const baseUrl = `http://127.0.0.1:${port}`;
const statusUrl = `${baseUrl}/__status`;
const smokeUrl = `${baseUrl}/tests/browser/workbench-persistence-smoke.html`;
const resultsPath = path.join(projectRoot, "artifacts", "workbench-browser-smoke-result.json");
const result = {
  status: "failed",
  smokeUrl,
  startedAt: new Date().toISOString(),
  completedAt: null,
  checks: [],
  pageErrors: [],
  error: null,
};

let server;
let browser;
let page;
try {
  server = spawn(process.execPath, [serverScript, "--port", String(port)], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  server.on("error", (error) => {
    result.error = `Could not start browser smoke server: ${error.message}`;
  });

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Browser smoke server exited with code ${server.exitCode}`);
    try {
      const response = await fetch(statusUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The local server may still be starting.
    }
    await delay(250);
  }
  if (!ready) throw new Error(`Browser smoke server did not become ready at ${statusUrl}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (error) => result.pageErrors.push(error.stack || error.message));
  await page.goto(smokeUrl, { waitUntil: "load", timeout: 30_000 });

  let browserResult = null;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Browser smoke server exited while test was running (code ${server.exitCode})`);
    try {
      const response = await fetch(statusUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const status = await response.json();
        if (status.done && status.result) {
          browserResult = status.result;
          break;
        }
      }
    } catch {
      // Ignore transient status-read errors until timeout.
    }
    await delay(400);
  }
  if (!browserResult) throw new Error("Timed out waiting 180 seconds for browser persistence smoke result");

  result.checks = Array.isArray(browserResult.results) ? browserResult.results : [];
  if (browserResult.status !== "passed") throw new Error("The browser persistence smoke page reported failure");
  if (result.pageErrors.length) throw new Error(`Browser raised ${result.pageErrors.length} unhandled page error(s)`);

  result.status = "passed";
  console.log(`\nPASS — browser persistence smoke (${result.checks.length} reported checks)`);
  for (const check of result.checks) console.log(check);
} catch (error) {
  result.error = result.error || error?.stack || String(error);
  console.error("\nFAIL — browser persistence smoke");
  console.error(result.error);
  if (result.pageErrors.length) console.error(result.pageErrors.join("\n"));
  process.exitCode = 1;
} finally {
  result.completedAt = new Date().toISOString();
  try {
    await mkdir(path.dirname(resultsPath), { recursive: true });
    await writeFile(resultsPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Browser smoke report: ${path.relative(projectRoot, resultsPath)}`);
  } catch (error) {
    console.error(`Could not write browser smoke report: ${error?.message || error}`);
    process.exitCode = 1;
  }
  if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
