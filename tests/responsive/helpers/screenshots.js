import fs from "node:fs";
import path from "node:path";
import { settle } from "./viewport.js";

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "shot";
}

/** Hide carets, blinking cursors and anything flagged as dynamic so shots are stable. */
const STABILISE_CSS = `
  *, *::before, *::after { caret-color: transparent !important; }
  [data-qa-dynamic], .canvas-tab-sync, .collaboration-cursor-label { visibility: hidden !important; }
`;

export async function captureScreenshot(page, { artifactsDir, viewportId, suite, name, fullPage = false, embed = false }) {
  await settle(page);
  const rel = path.join("screenshots", viewportId, suite, `${slug(name)}.png`);
  const abs = path.join(artifactsDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await page.addStyleTag({ content: STABILISE_CSS }).catch(() => {});
  await page.screenshot({ path: abs, fullPage, animations: "disabled", caret: "hide", scale: "css" });
  let thumb = null;
  if (embed) {
    const buf = await page.screenshot({ type: "jpeg", quality: 55, fullPage, animations: "disabled", caret: "hide", scale: "css" });
    thumb = `data:image/jpeg;base64,${buf.toString("base64")}`;
  }
  return { file: rel.split(path.sep).join("/"), thumb };
}

/**
 * Optional pixel baseline regression using Playwright's own toHaveScreenshot
 * (no extra dependency). Baselines live in tests/responsive/baselines/<vp>/<suite>/<name>.png
 * (see snapshotPathTemplate in the config). Enable with RESPONSIVE_BASELINE=compare,
 * create/refresh with RESPONSIVE_BASELINE=update (or --update-snapshots).
 */
export async function compareBaseline(page, expect, { viewportId, suite, name, maxDiffPixelRatio = 0.01 }) {
  try {
    await expect(page).toHaveScreenshot([viewportId, suite, `${slug(name)}.png`], {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio,
    });
    return null;
  } catch (error) {
    const message = String(error && error.message ? error.message : error).split("\n")[0];
    return { missing: /snapshot.*(doesn't|does not) exist|missing/i.test(message), message };
  }
}
