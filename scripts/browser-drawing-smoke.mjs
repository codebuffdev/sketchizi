import { chromium } from "playwright";

const baseURL = process.env.SKETCHIZI_BASE_URL || "http://127.0.0.1:4173";

const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));

async function dismissStartupChooser(target = page) {
  const title = target.getByRole("heading", { name: "Start with" });
  await title.waitFor({ timeout: 15000 });
  const chooser = target.getByRole("dialog").filter({ has: title });
  await chooser.getByRole("button", { name: "Infinity" }).click();
  await chooser.waitFor({ state: "detached" });
}

async function ensureHeaderVisible() {
  const reveal = page.locator(".desktop-app-header-reveal-handle");
  await reveal.waitFor({ state: "attached", timeout: 15000 });
  if (await reveal.getAttribute("aria-expanded") !== "true") await reveal.click({ force: true });
  await page.waitForFunction(() =>
    document.querySelector(".desktop-app-header")?.getAttribute("aria-hidden") === "false",
  );
  const pin = page.locator(".desktop-app-header-pin-button");
  if (await pin.getAttribute("aria-pressed") !== "true") await pin.click({ force: true });
  await page.waitForFunction(() =>
    document.querySelector(".desktop-app-header-pin-button")?.getAttribute("aria-pressed") === "true",
  );
}

async function currentDrawing() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sketchizi-local-state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("documents", "readonly");
        const store = transaction.objectStore("documents");
        const mainRequest = store.get("main");
        const tabsRequest = store.get("canvas-tabs-manifest");
        transaction.oncomplete = () => {
          const tabs = tabsRequest.result?.tabs;
          const activeTab = Array.isArray(tabs) && (tabs.find((tab) => tab.active) || tabs[0]);
          // Open canvases now persist their authoritative scene in the tab
          // manifest. The legacy "main" record can be empty after a reload
          // while the active canvas snapshot remains intact.
          resolve(activeTab?.snapshot
            ? { ...activeTab.snapshot, savedAt: tabsRequest.result.savedAt, source: "canvas-tab" }
            : mainRequest.result || null);
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}

async function awaitScene(check, description) {
  // The editor may briefly persist a stale restoration snapshot while a new
  // drawing is being committed. Require the expected record to remain durable
  // across multiple polls rather than trusting a single transient read.
  const deadline = Date.now() + 20000;
  let consecutiveMatches = 0;
  let lastScene = null;
  while (Date.now() < deadline) {
    lastScene = await currentDrawing();
    const visible = (lastScene?.elements || []).filter((element) => element && !element.isDeleted);
    const original = await page.evaluate(() => window.__drawingSmokeOriginalBounds);
    const matched = description === "rectangle"
      ? visible.some((element) => element.type === "rectangle" && element.width > 60 && element.height > 40)
      : description === "grid"
        ? lastScene?.appState?.gridModeEnabled === true
        : description === "moved" || description === "restored"
          ? visible.some((element) => element.id === original?.id && Math.abs(element.x - original.x) > 15 && Math.abs(element.y - original.y) > 15) && (description !== "restored" || lastScene?.appState?.gridModeEnabled === true)
          : false;
    if (matched && await check()) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= 3) return;
    } else {
      consecutiveMatches = 0;
    }
    await page.waitForTimeout(250);
  }
  const editorDiagnostics = await page.evaluate(() => ({
    activeElement: document.activeElement?.outerHTML?.slice(0, 400),
    canvasCount: document.querySelectorAll(".excalidraw canvas").length,
    selectedTool: document.querySelector('[data-testid="toolbar-selection"]')?.getAttribute("aria-pressed"),
    rectangleTool: document.querySelector('[data-testid="toolbar-rectangle"]')?.getAttribute("aria-pressed"),
    visibleText: document.body.innerText.slice(0, 800),
  }));
  throw new Error("Drawing smoke did not durably persist " + description + ": " +
    JSON.stringify({ stored: { savedAt: lastScene?.savedAt, gridModeEnabled: lastScene?.appState?.gridModeEnabled, gridSize: lastScene?.appState?.gridSize, elements: lastScene?.elements?.map((e) => ({ id: e.id, type: e.type, deleted: e.isDeleted, x: e.x, y: e.y, width: e.width, height: e.height })) }, editorDiagnostics }));
}

try {
  const previousBuild = process.env.SKETCHIZI_PREVIOUS_BUILD_URL;
  const usePreviousBuild = async (route) => {
    const requestURL = new URL(route.request().url());
    const upstream = new URL(requestURL.pathname + requestURL.search, previousBuild);
    await route.fulfill({ response: await route.fetch({ url: upstream.href }) });
  };
  const appRequests = (url) => url.origin === new URL(baseURL).origin;
  if (previousBuild) await page.route(appRequests, usePreviousBuild);
  await page.goto(baseURL + "/?editor=1", { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser();
  const viewport = page.locator(".excalidraw");
  await viewport.waitFor({ state: "visible" });
  // Do not draw while IndexedDB restoration is still replacing the scene.
  await ensureHeaderVisible();
  await page.locator(".desktop-app-document-identity-dirty-dot.is-saved").waitFor({ state: "attached", timeout: 20000 });
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Excalidraw viewport has no visible bounds.");

  // Use Excalidraw's native rectangle shortcut and drag; do not bypass canvas
  // interactions by injecting elements or using internal APIs.
  const x = Math.round(bounds.x + bounds.width * 0.28);
  const y = Math.round(bounds.y + bounds.height * 0.37);
  await page.mouse.click(x - 25, y - 25);
  await page.keyboard.press("r");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 115, y + 75, { steps: 12 });
  await page.mouse.up();

  await awaitScene(async () => {
    const scene = await currentDrawing();
    return scene?.elements?.some((element) => element.type === "rectangle" && !element.isDeleted && element.width > 60 && element.height > 40);
  }, "rectangle");
  const drawn = (await currentDrawing()).elements.find((element) => element.type === "rectangle" && !element.isDeleted);
  console.log("PASS: native canvas drag creates a rectangle and autosaves it to IndexedDB.");

  // Select the unfilled rectangle by its visible outline and confirm the editor exposes shape actions.
  await page.keyboard.press("v");
  await page.mouse.click(x + 56, y + 2);
  await page.getByText("Selected shape actions", { exact: true }).waitFor();
  console.log("PASS: Selection exposes contextual actions for the drawn shape.");

  // Move the selected unfilled rectangle by dragging its visible outline.
  await page.keyboard.press("v");
  await page.evaluate((original) => { window.__drawingSmokeOriginalBounds = original; }, { id: drawn.id, x: drawn.x, y: drawn.y });
  await page.mouse.move(x + 56, y + 2);
  await page.mouse.down();
  await page.mouse.move(x + 82, y + 64, { steps: 12 });
  const guides = await page.locator(".sketchizi-alignment-guides line").count();
  if (guides > 2) throw new Error("Smart guides exceeded the two-line display limit: " + guides);
  await page.mouse.up();

  await awaitScene(async () => {
    const scene = await currentDrawing();
    return scene?.elements?.some((element) => element.id === drawn.id && Math.abs(element.x - drawn.x) > 15 && Math.abs(element.y - drawn.y) > 15);
  }, "moved");
  console.log("PASS: native selection drag moves an existing shape and persists its new position.");
  // G is a color-picker shortcut, not the Excalidraw grid shortcut.
  // Deselect the shape and use the native Ctrl/Cmd + apostrophe grid toggle.
  await page.keyboard.press("Escape");
  await page.mouse.click(x - 70, y - 70);
  await viewport.focus();
  await page.keyboard.press("ControlOrMeta+Quote");
  await awaitScene(async () => (await currentDrawing())?.appState?.gridModeEnabled === true, "grid");
  console.log("PASS: G enables Excalidraw's native grid and persists the setting.");

  const beforeReload = await currentDrawing();
  console.log("Before reload:", JSON.stringify({ gridModeEnabled: beforeReload?.appState?.gridModeEnabled, gridSize: beforeReload?.appState?.gridSize, rectangle: beforeReload?.elements?.find((element) => element.id === drawn.id) && { x: beforeReload.elements.find((element) => element.id === drawn.id).x, y: beforeReload.elements.find((element) => element.id === drawn.id).y } }));
  if (previousBuild) await page.unroute(appRequests, usePreviousBuild);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.locator(".excalidraw").waitFor();
  await page.locator(".desktop-app-document-identity-dirty-dot.is-saved").waitFor({ state: "attached", timeout: 20000 });
  await page.evaluate((original) => { window.__drawingSmokeOriginalBounds = original; }, { id: drawn.id, x: drawn.x, y: drawn.y });
  await awaitScene(async () => {
    const scene = await currentDrawing();
    return scene?.elements?.some((element) => element.id === drawn.id && Math.abs(element.x - drawn.x) > 15) && scene?.appState?.gridModeEnabled === true;
  }, "restored");
  const restored = await currentDrawing();
  const rectangle = restored?.elements?.find((element) => element.id === drawn.id && !element.isDeleted);
  if (!rectangle || Math.abs(rectangle.x - drawn.x) <= 15 || !restored?.appState?.gridModeEnabled) {
    throw new Error("Reload did not restore the moved rectangle and native grid state.");
  }
  // Hit-test the restored shape on the actual canvas. A stored snapshot can
  // exist even when the editor has restored a different scene.
  await page.keyboard.press("v");
  await page.mouse.click(x + 82, y + 64);
  await page.getByText("Selected shape actions", { exact: true }).waitFor();
  console.log("PASS: the restored rectangle is selectable and native grid survives browser reload.");

  if (!previousBuild && process.env.SKETCHIZI_VERIFY_FILE_ROUND_TRIP === "1") {
    await page.getByRole("button", { name: /Download and save options/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download recovery backup/ }).click(),
    ]);
    const importedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const importedPage = await importedContext.newPage();
    importedPage.on("pageerror", (error) => errors.push(error.message));
    // Use the app's file-input fallback so the download can be selected in CI.
    await importedPage.addInitScript(() => {
      Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    });
    await importedPage.goto(baseURL + "/?editor=1", { waitUntil: "networkidle", timeout: 60000 });
    await importedPage.getByRole("button", { name: "Infinity" }).click();
    await importedPage.getByRole("button", { name: "Open application menu" }).click();
    const [chooser] = await Promise.all([
      importedPage.waitForEvent("filechooser"),
      importedPage.getByRole("button", { name: "Open file", exact: true }).click(),
    ]);
    await chooser.setFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: await (await import("node:fs/promises")).readFile(await download.path()),
    });
    await importedPage.getByText(`Opened ${download.suggestedFilename()}`, { exact: true }).waitFor();
    await importedPage.keyboard.press("v");
    await importedPage.mouse.click(x + 82, y + 64);
    await importedPage.getByText("Selected shape actions", { exact: true }).waitFor();
    await importedContext.close();
    await page.bringToFront();
    console.log("PASS: the exported drawing imports into a fresh editor and is selectable.");
  }

  if (previousBuild) {
    console.log("PASS: a drawing saved by the base build opens and is selectable on the candidate build.");
  } else {
    // Draw again and reload before the debounced write can finish. The same
    // browser tab must reopen the pending drawing as well as its saved scene.
    const quickX = Math.round(bounds.x + bounds.width * 0.57);
    const quickY = Math.round(bounds.y + bounds.height * 0.50);
    await page.keyboard.press("Escape");
    await page.keyboard.press("r");
    await page.mouse.move(quickX, quickY);
    await page.mouse.down();
    await page.mouse.move(quickX + 100, quickY + 60, { steps: 6 });
    await page.mouse.up();
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await viewport.waitFor({ state: "visible" });
    await page.keyboard.press("v");
    await page.mouse.click(quickX + 50, quickY + 2);
    await page.getByText("Selected shape actions", { exact: true }).waitFor();
    console.log("PASS: a rectangle survives immediate reload and remains selectable.");

    await page.getByRole("button", { name: "Create new canvas" }).click();
    const secondTab = page.getByRole("tab", { name: "Canvas 2", exact: true });
    await secondTab.waitFor();
    const secondX = Math.round(bounds.x + bounds.width * 0.42);
    const secondY = Math.round(bounds.y + bounds.height * 0.64);
    await page.mouse.click(secondX - 20, secondY - 20);
    await page.keyboard.press("r");
    await page.mouse.move(secondX, secondY);
    await page.mouse.down();
    await page.mouse.move(secondX + 130, secondY + 85, { steps: 8 });
    await page.mouse.up();
    await awaitScene(async () => {
      const active = await currentDrawing();
      return active?.elements?.some((element) => element.type === "rectangle" && element.id !== drawn.id)
        && !active?.elements?.some((element) => element.id === drawn.id);
    }, "rectangle");
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await secondTab.waitFor();
    if (await secondTab.getAttribute("aria-selected") !== "true") throw new Error("Reload did not activate Canvas 2.");
    await page.keyboard.press("v");
    await page.mouse.click(secondX + 65, secondY + 2);
    await page.getByText("Selected shape actions", { exact: true }).waitFor();
    await page.getByRole("tab").and(page.getByTitle("Canvas 1", { exact: true })).click();
    await page.keyboard.press("v");
    await page.mouse.click(quickX + 50, quickY + 2);
    await page.getByText("Selected shape actions", { exact: true }).waitFor();
    console.log("PASS: both canvas tabs restore their own selectable drawings.");

    for (const failedKey of ["main", "canvas-tabs-manifest"]) {
      const failingContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const failingPage = await failingContext.newPage();
        await failingPage.goto(baseURL + "/?editor=1", { waitUntil: "networkidle", timeout: 60000 });
        await dismissStartupChooser(failingPage);
        const failureViewport = failingPage.locator(".excalidraw");
        await failureViewport.waitFor({ state: "visible" });
        const failureBounds = await failureViewport.boundingBox();
        if (!failureBounds) throw new Error("Failure test has no visible drawing viewport.");
        await failingPage.evaluate((keyToFail) => {
          const originalPut = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === "documents" && key === keyToFail) {
              throw new DOMException("Simulated full storage", "QuotaExceededError");
            }
            return originalPut.apply(this, arguments);
          };
        }, failedKey);
        const failureX = Math.round(failureBounds.x + failureBounds.width * 0.35);
        const failureY = Math.round(failureBounds.y + failureBounds.height * 0.4);
        await failingPage.mouse.click(failureX - 20, failureY - 20);
        await failingPage.keyboard.press("r");
        await failingPage.mouse.move(failureX, failureY);
        await failingPage.mouse.down();
        await failingPage.mouse.move(failureX + 120, failureY + 90, { steps: 6 });
        await failingPage.mouse.up();
        await failingPage.getByLabel("Local save failed", { exact: true }).waitFor({ timeout: 25000 });
        console.log(`PASS: a failed ${failedKey} write shows a local save error.`);
      } finally {
        await failingContext.close();
      }
    }

  }

  if (errors.length) throw new Error("Browser runtime exceptions: " + errors.join(" | "));
} catch (error) {
  if (process.env.SKETCHIZI_DRAWING_FAILURE_SCREENSHOT) {
    await page.screenshot({ path: process.env.SKETCHIZI_DRAWING_FAILURE_SCREENSHOT }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
