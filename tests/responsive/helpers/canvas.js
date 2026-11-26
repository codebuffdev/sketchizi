import { SEL } from "../config/selectors.js";
import { settle } from "./viewport.js";

/**
 * Canvas helpers. Shapes are never located through the DOM: everything is
 * driven by canvas.boundingBox() coordinates + pointer / touch events and
 * Excalidraw keyboard shortcuts (r rectangle, a arrow, t text, v select, h hand).
 */
export async function canvasBox(page) {
  const loc = page.locator(SEL.canvasEl).first();
  await loc.waitFor({ state: "visible", timeout: 15_000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error("Excalidraw canvas has no bounding box");
  return box;
}

/** Fractional canvas point -> absolute page coordinates. */
export function pt(box, fx, fy) {
  return { x: Math.round(box.x + box.width * fx), y: Math.round(box.y + box.height * fy) };
}

export async function pickTool(page, key) {
  // Click empty canvas first so the keyboard shortcut reaches Excalidraw (smoke-script pattern).
  await page.locator(SEL.excalidraw).first().focus().catch(() => {});
  await page.keyboard.press(key);
}

export async function mouseDrag(page, from, to, { steps = 10 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export async function drawShape(page, tool, from, to) {
  await pickTool(page, { rectangle: "r", arrow: "a", ellipse: "o", diamond: "d", line: "l" }[tool] || tool);
  await mouseDrag(page, from, to);
  await settle(page, { frames: 1 });
}

export async function drawText(page, at, text) {
  await pickTool(page, "t");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Escape");
  await settle(page, { frames: 1 });
}

export async function selectAll(page) {
  await pickTool(page, "v");
  await page.keyboard.press("ControlOrMeta+a");
  await settle(page, { frames: 1 });
}

export async function clickEmpty(page, at) {
  await pickTool(page, "v");
  await page.mouse.click(at.x, at.y);
  await settle(page, { frames: 1 });
}

export async function marquee(page, from, to) {
  await pickTool(page, "v");
  await mouseDrag(page, from, to, { steps: 14 });
  await settle(page, { frames: 1 });
}

export async function shiftClick(page, at) {
  await page.keyboard.down("Shift");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up("Shift");
  await settle(page, { frames: 1 });
}

export async function zoom(page, direction, box) {
  const b = box || (await canvasBox(page));
  const c = pt(b, 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, direction === "in" ? -240 : 240);
  await page.keyboard.up("Control");
  await settle(page, { frames: 2 });
}

export async function pan(page, from, to) {
  await pickTool(page, "h");
  await mouseDrag(page, from, to, { steps: 8 });
  await pickTool(page, "v");
  await settle(page, { frames: 1 });
}

/* ------------------------------------------------------------------ touch */

async function cdp(page) {
  if (!page.__qaCdp) page.__qaCdp = await page.context().newCDPSession(page);
  return page.__qaCdp;
}

export async function touchTap(page, at) {
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

export async function touchDrag(page, from, to, { steps = 8 } = {}) {
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

export async function touchPinch(page, center, { from = 30, to = 120, steps = 8 } = {}) {
  const c = await cdp(page);
  const points = (d) => [{ x: center.x - d, y: center.y, id: 1 }, { x: center.x + d, y: center.y, id: 2 }];
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let i = 1; i <= steps; i++) {
    await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + ((to - from) * i) / steps) });
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settle(page, { frames: 2 });
}

/* ------------------------------------------------------------ scene state */

/**
 * Reads persisted editor state from IndexedDB using the same contract as
 * scripts/browser-drawing-smoke.mjs: database "sketchizi-local-state", store
 * "documents", record "canvas-tabs-manifest" (active tab snapshot) with the
 * legacy "main" record as fallback.
 * Returns { scene, tabs } (either may be null).
 */
export async function readPersisted(page) {
  return page.evaluate(async () => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sketchizi-local-state");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!Array.from(db.objectStoreNames).includes("documents")) return { scene: null, tabs: null };
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("documents", "readonly");
          const store = tx.objectStore("documents");
          const main = store.get("main");
          const manifest = store.get("canvas-tabs-manifest");
          tx.oncomplete = () => {
            const tabs = Array.isArray(manifest.result?.tabs) ? manifest.result.tabs : null;
            const active = tabs && (tabs.find((t) => t.active) || tabs[0]);
            const scene = active?.snapshot || main.result || null;
            resolve({
              scene: scene ? { elements: scene.elements || [], appState: scene.appState || null } : null,
              tabs: tabs ? tabs.map((t) => ({ id: t.id, name: t.name, active: Boolean(t.active) })) : null,
            });
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    } catch (e) {
      return { scene: null, tabs: null };
    }
  });
}

export async function readScene(page) {
  return (await readPersisted(page)).scene;
}

/** Polls until `predicate(liveElements)` is true; returns the elements or null on timeout. */
export async function waitForElements(page, predicate, { timeout = 10_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const scene = await readScene(page);
    const live = (scene?.elements || []).filter((e) => e && !e.isDeleted);
    if (predicate(live)) return live;
    await page.waitForTimeout(250);
  }
  return null;
}

export async function waitForTabs(page, predicate, { timeout = 10_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const { tabs } = await readPersisted(page);
    if (tabs && predicate(tabs)) return tabs;
    await page.waitForTimeout(250);
  }
  return null;
}
