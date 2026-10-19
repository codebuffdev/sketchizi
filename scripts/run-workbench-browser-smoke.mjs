import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const serverScript = path.join(scriptDirectory, "workbench-browser-test-server.mjs");
const port = Number(process.env.WORKBENCH_TEST_PORT || 8765);
const chromiumPath = process.env.WORKBENCH_CHROMIUM_PATH || process.env.CHROMIUM_PATH || "chromium";
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
  browser: chromiumPath,
  runner: "chromium-devtools-protocol",
  startedAt: new Date().toISOString(),
  completedAt: null,
  checks: [],
  pageErrors: [],
  failureCategory: null,
  remediation: null,
  error: null,
};

let server;
let browserProcess;
let cdp;
let profileDirectory;
let browserWebSocket;
let pageLoaded = false;
let requestId = 0;
const pending = new Map();

function cdpSend(method, params = {}) {
  if (!browserWebSocket || browserWebSocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`Chromium DevTools connection is not open (command: ${method})`));
  }
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chromium DevTools command timed out: ${method}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout, method });
    browserWebSocket.send(JSON.stringify({ id, method, params }));
  });
}

async function waitForHttp(url, { attempts = 60, intervalMs = 250, method = "GET" } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
      lastError = new Error(`${method} ${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (browserProcess?.exitCode !== null && browserProcess?.exitCode !== undefined) {
      throw new Error(`Chromium exited with code ${browserProcess.exitCode}`);
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${method} ${url}: ${lastError?.message || "no response"}`);
}

async function launchChromium() {
  profileDirectory = await mkdtemp(path.join(os.tmpdir(), "sketchizi-workbench-chromium-"));
  browserProcess = spawn(chromiumPath, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profileDirectory}`, "about:blank",
  ], { cwd: projectRoot, stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" });
  browserProcess.on("error", (error) => { result.error = `Could not launch Chromium (${chromiumPath}): ${error.message}`; });
  const activePortPath = path.join(profileDirectory, "DevToolsActivePort");
  let activePort;
  let browserPath;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (browserProcess.exitCode !== null) throw new Error(`Chromium exited with code ${browserProcess.exitCode}; verify WORKBENCH_CHROMIUM_PATH`);
    try {
      const [portLine, pathLine] = (await readFile(activePortPath, "utf8")).trim().split(/\r?\n/);
      activePort = Number(portLine);
      browserPath = pathLine;
      if (Number.isInteger(activePort) && activePort > 0 && browserPath?.startsWith("/devtools/browser/")) break;
    } catch {
      // Chromium creates this file after starting its DevTools endpoint.
    }
    await delay(125);
  }
  if (!activePort || !browserPath) throw new Error("Chromium did not publish DevToolsActivePort within 10 seconds");
  const endpoint = `http://127.0.0.1:${activePort}${browserPath}`;
  cdp = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chromium DevTools")), 10_000);
    cdp.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    cdp.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Could not connect to Chromium DevTools")); }, { once: true });
  });
  browserWebSocket = cdp;
  cdp.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message || "DevTools command failed"}`));
      else item.resolve(message.result || {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      result.pageErrors.push(details?.exception?.description || details?.text || "Unhandled browser exception");
    }
    if (message.method === "Page.loadEventFired") pageLoaded = true;
  });
  return activePort;
}

function terminateProcessTree(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

try {
  server = spawn(process.execPath, [serverScript, "--port", String(port)], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  server.on("error", (error) => { result.error = `Could not start browser smoke server: ${error.message}`; });
  await waitForHttp(statusUrl);
  console.log("[browser-smoke] server ready");
  const devToolsPort = await launchChromium();
  console.log(`[browser-smoke] Chromium DevTools ready on ${devToolsPort}`);
  const targetResponse = await fetch(`http://127.0.0.1:${devToolsPort}/json/new?${encodeURIComponent(smokeUrl)}`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`Chromium could not create smoke page (HTTP ${targetResponse.status})`);
  console.log(`[browser-smoke] create target response ${targetResponse.status}`);
  const target = await targetResponse.json();
  if (!target.webSocketDebuggerUrl) throw new Error("Chromium did not return a page DevTools URL");
  // The browser endpoint connection is replaced by the page-target connection for page events and commands.
  cdp.close();
  browserWebSocket = null;
  cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chromium page target")), 10_000);
    cdp.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    cdp.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Could not connect to Chromium page target")); }, { once: true });
  });
  browserWebSocket = cdp;
  cdp.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message || "DevTools command failed"}`));
      else item.resolve(message.result || {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      result.pageErrors.push(details?.exception?.description || details?.text || "Unhandled browser exception");
    }
    if (message.method === "Page.loadEventFired") pageLoaded = true;
  });
  console.log("[browser-smoke] page target connected");
  await cdpSend("Page.enable");
  await cdpSend("Runtime.enable");
  const navigation = await cdpSend("Page.navigate", { url: smokeUrl });
  if (navigation.errorText) throw new Error(`Chromium blocked navigation to the local smoke page: ${navigation.errorText}. This usually indicates a browser policy or environment restriction, not a passing smoke test.`);
  console.log("[browser-smoke] navigation requested");
  const readyDeadline = Date.now() + 30_000;
  let readyState = "unknown";
  while (Date.now() < readyDeadline) {
    const evaluated = await cdpSend("Runtime.evaluate", { expression: "JSON.stringify({readyState: document.readyState, href: location.href, title: document.title})", returnByValue: true }).catch(() => null);
    try { readyState = JSON.parse(evaluated?.result?.value || "null")?.readyState || "unknown"; } catch {}
    if (readyState === "complete") break;
    await delay(150);
  }
  if (readyState !== "complete") throw new Error(`Chromium page did not reach document.readyState=complete (last state: ${readyState})`);
  console.log("[browser-smoke] smoke page loaded");

  let browserResult = null;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Browser smoke server exited while test was running (code ${server.exitCode})`);
    try {
      const response = await fetch(statusUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const status = await response.json();
        if (status.done && status.result) { browserResult = status.result; break; }
      }
    } catch {
      // Ignore transient status-read errors until timeout.
    }
    await delay(250);
  }
  if (!browserResult) throw new Error("Timed out waiting 180 seconds for browser persistence smoke result");
  result.checks = Array.isArray(browserResult.results) ? browserResult.results : [];
  if (browserResult.status !== "passed") throw new Error("The browser persistence smoke page reported failure");
  if (result.pageErrors.length) throw new Error(`Chromium raised ${result.pageErrors.length} unhandled page error(s)`);
  result.status = "passed";
  console.log(`\nPASS — Chromium browser persistence smoke (${result.checks.length} reported checks)`);
  for (const check of result.checks) console.log(check);
} catch (error) {
  result.error = result.error || error?.stack || String(error);
  const failureText = String(error?.message || error || result.error);
  if (/ERR_BLOCKED_BY_ADMINISTRATOR|blocked navigation to the local smoke page/i.test(failureText)) {
    result.failureCategory = "environment-policy-block";
    result.remediation = "Run the browser smoke in a CI or local environment where Chromium is permitted to navigate to the loopback test server. Do not treat this result as a passing browser test.";
  } else if (/Could not launch Chromium|Chromium did not publish DevToolsActivePort|Could not connect to Chromium DevTools/i.test(failureText)) {
    result.failureCategory = "browser-launch-or-devtools";
    result.remediation = "Verify the Chromium executable path and that the runner can start Chromium with its isolated temporary profile and DevTools endpoint.";
  } else if (/Timed out|did not reach document.readyState|waiting 180 seconds/i.test(failureText)) {
    result.failureCategory = "browser-smoke-timeout";
    result.remediation = "Inspect the browser smoke page, server status, and browser console; determine whether the workflow stalled or the environment blocked page execution.";
  } else if (/reported failure|unhandled page error|assertion|check failed/i.test(failureText)) {
    result.failureCategory = "browser-assertion-or-page-error";
    result.remediation = "Inspect the reported browser checks and page errors, then fix the failing application or smoke assertion.";
  } else {
    result.failureCategory = "browser-runner-error";
    result.remediation = "Inspect the error and browser smoke logs to identify the earliest failed runner operation.";
  }
  console.error("\nFAIL — Chromium browser persistence smoke");
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
  for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error("Browser smoke runner shutting down")); }
  pending.clear();
  try { cdp?.close(); } catch {}
  if (browserProcess && browserProcess.exitCode === null) terminateProcessTree(browserProcess, "SIGTERM");
  if (server && server.exitCode === null) server.kill("SIGTERM");
  await delay(250);
  if (browserProcess && browserProcess.exitCode === null) terminateProcessTree(browserProcess, "SIGKILL");
  if (server && server.exitCode === null) server.kill("SIGKILL");
  if (profileDirectory) await rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
}
