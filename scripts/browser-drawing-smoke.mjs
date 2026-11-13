import { chromium } from "playwright";

const baseURL = process.env.SKETCHIZI_BASE_URL || "http://127.0.0.1:4173";

const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));

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
        const request = transaction.objectStore("documents").get("main");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function awaitScene(check, description) {
  await page.waitForFunction(async (description) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sketchizi-local-state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const scene = await new Promise((resolve, reject) => {
        const transaction = db.transaction("documents", "readonly");
        const request = transaction.objectStore("documents").get("main");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      const visible = (scene?.elements || []).filter((element) => element && !element.isDeleted);
      if (description === "rectangle") return visible.some((element) => element.type === "rectangle" && element.width > 60 && element.height > 40);
      if (description === "grid") return scene?.appState?.gridModeEnabled === true;
      if (description === "moved") {
        const original = window.__drawingSmokeOriginalBounds;
        return visible.some((element) => element.id === original?.id && Math.abs(element.x - original.x) > 15 && Math.abs(element.y - original.y) > 15);
      }
      return false;
    } finally {
      db.close();
    }
  }, description, { timeout: 20000, polling: 200 }).catch((error) => {
    throw new Error("Drawing smoke did not persist " + description + ": " + error.message);
  });
  if (!(await check())) {
    const scene = await currentDrawing();
    throw new Error("Drawing smoke verification failed: " + description + "; stored scene: " + JSON.stringify({ savedAt: scene?.savedAt, elements: scene?.elements?.map((e) => ({ id: e.id, type: e.type, deleted: e.isDeleted, x: e.x, y: e.y, width: e.width, height: e.height })) }));
  }
}

try {
  await page.goto(baseURL + "/?editor=1", { waitUntil: "networkidle", timeout: 60000 });
  const viewport = page.locator(".excalidraw");
  await viewport.waitFor({ state: "visible" });
  // Do not draw while IndexedDB restoration is still replacing the scene.
  await page.getByRole("button", { name: /Local document save status: (Autosave ready|Saved locally)/ }).waitFor({ timeout: 15000 });
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

  // A first drag must work even before an object is selected.
  await page.keyboard.press("v");
  await page.evaluate((original) => { window.__drawingSmokeOriginalBounds = original; }, { id: drawn.id, x: drawn.x, y: drawn.y });
  await page.mouse.move(x + 40, y + 30);
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

  await page.keyboard.press("g");
  await awaitScene(async () => (await currentDrawing())?.appState?.gridModeEnabled === true, "grid");
  console.log("PASS: G enables Excalidraw's native grid and persists the setting.");

  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.locator(".excalidraw").waitFor();
  const restored = await currentDrawing();
  const rectangle = restored?.elements?.find((element) => element.id === drawn.id && !element.isDeleted);
  if (!rectangle || Math.abs(rectangle.x - drawn.x) <= 15 || !restored?.appState?.gridModeEnabled) {
    throw new Error("Reload did not restore the moved rectangle and native grid state.");
  }
  console.log("PASS: drawing content and native grid survive browser reload.");

  if (errors.length) throw new Error("Browser runtime exceptions: " + errors.join(" | "));
} finally {
  await browser.close();
}
