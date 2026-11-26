import { SEL } from "../config/selectors.js";
import { settle } from "./viewport.js";

/**
 * Boot + navigation helpers. Patterns mirror the repo's own browser smoke
 * scripts: `/?editor=1`, the startup chooser, tab status dot as the "ready"
 * signal, and the command palette (Ctrl/Cmd+K) as the stable way to reach
 * studios and panels at every width.
 */
export const BOOT_MODES = {
  infinite: { url: "/?editor=1", chooser: null },
  pages: { url: "/", chooser: "Pages" },
  "system-design": { url: "/", chooser: "System Design" },
};

export async function dismissStartupChooser(page, choose = "Infinity") {
  const chooser = page.locator(SEL.startupChooser).first();
  if (!(await chooser.isVisible().catch(() => false))) return false;
  const option = page.locator(SEL.startupOption).filter({ hasText: new RegExp(choose, "i") }).first();
  if (await option.isVisible().catch(() => false)) await option.click();
  else await page.keyboard.press("Escape");
  await chooser.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  return true;
}

export async function waitForEditorReady(page, { timeout = 30_000 } = {}) {
  await page.locator(SEL.excalidraw).first().waitFor({ state: "visible", timeout });
  // Do not interact while IndexedDB restoration may still replace the scene.
  await page.locator(SEL.tabReady).first().waitFor({ state: "attached", timeout }).catch(() => {});
  await settle(page);
}

export async function bootApp(page, { mode = "infinite", query = "" } = {}) {
  const def = BOOT_MODES[mode] || BOOT_MODES.infinite;
  const url = def.url + (query ? (def.url.includes("?") ? "&" : "?") + query.replace(/^[?&]/, "") : "");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(`${SEL.app}, ${SEL.startupChooser}`).first().waitFor({ state: "visible", timeout: 30_000 });
  if (await page.locator(SEL.startupChooser).first().isVisible().catch(() => false)) {
    await dismissStartupChooser(page, def.chooser || "Infinity");
  }
  if (mode === "pages") await page.locator(SEL.pagesWorkspace).first().waitFor({ state: "visible", timeout: 30_000 });
  else if (mode === "infinite") await waitForEditorReady(page);
  await settle(page);
}

export async function isVisible(page, selector, timeout = 0) {
  const loc = page.locator(selector).first();
  if (timeout) { try { await loc.waitFor({ state: "visible", timeout }); return true; } catch { return false; } }
  return loc.isVisible().catch(() => false);
}

/** Returns the first selector from a list that is currently visible. */
export async function firstVisible(page, selectors, timeout = 0) {
  for (const sel of selectors) if (await isVisible(page, sel, timeout)) return sel;
  return null;
}

export async function openCommand(page, query, { exact = false } = {}) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.locator(SEL.commandPalette).first();
  if (!(await palette.isVisible().catch(() => false))) {
    const trigger = page.locator("button[aria-label*='command' i], button[aria-label*='Search' i]").first();
    if (await trigger.isVisible().catch(() => false)) await trigger.click();
  }
  await palette.waitFor({ state: "visible", timeout: 5000 });
  const input = palette.locator("input").first();
  if (await input.isVisible().catch(() => false)) await input.fill(query);
  const item = palette.getByText(exact ? new RegExp(`^${query}$`, "i") : new RegExp(query, "i")).first();
  if (await item.isVisible().catch(() => false)) await item.click();
  else await page.keyboard.press("Enter");
  await settle(page);
}

/** Opens a panel by its own control first; falls back to the command palette. */
export async function openSurface(page, { selector, controls = [], command = null }) {
  if (await isVisible(page, selector)) return true;
  for (const c of controls) {
    const btn = page.locator(c).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ trial: false }).catch(() => {});
      if (await isVisible(page, selector, 2500)) { await settle(page); return true; }
    }
  }
  if (command) {
    await openCommand(page, command).catch(() => {});
    if (await isVisible(page, selector, 3500)) { await settle(page); return true; }
  }
  return false;
}

export async function closeSurface(page, { selector, closeControls = [] }) {
  for (const c of closeControls) {
    const btn = page.locator(c).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
  }
  if (await isVisible(page, selector)) await page.keyboard.press("Escape").catch(() => {});
  await page.locator(selector).first().waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  await settle(page);
  return !(await isVisible(page, selector));
}

export async function ensureHeaderVisible(page) {
  const handle = page.locator(".desktop-app-header-reveal-handle").first();
  if (await handle.isVisible().catch(() => false)) await handle.click().catch(() => {});
}
