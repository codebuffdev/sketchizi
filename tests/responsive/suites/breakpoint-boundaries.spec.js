import { test, expect } from "../fixtures/responsive.fixture.js";
import { BOUNDARY_PAIRS, DISCOVERED_EXTRA_PAIRS, viewportClassFor } from "../config/viewports.js";
import { SEL, settle, drawFixtureScene } from "../helpers/suite-kit.js";
import { resizeTo } from "../helpers/viewport.js";

/**
 * Runs only in the `bp-<width>` projects. Each project loads the app at ONE edge
 * width, then live-crosses to its partner (w±1) and back, verifying that:
 *   - data-viewport flips exactly where responsiveShell.js says it should
 *   - no horizontal overflow / clipped controls / overlaps appear on either side
 *   - the set of stylesheet @media(width) conditions that flip is recorded (discovery)
 */
function partnerOf(width) {
  for (const [lo, hi] of [...BOUNDARY_PAIRS, ...DISCOVERED_EXTRA_PAIRS]) {
    if (width === lo) return hi;
    if (width === hi) return lo;
  }
  return width;
}

async function mediaFingerprint(page) {
  return page.evaluate(() => {
    const conds = new Set();
    const walk = (rules) => { for (const r of rules) { if (r.constructor.name === "CSSMediaRule") { const t = r.conditionText || r.media.mediaText; if (/width/.test(t)) conds.add(t); walk(r.cssRules); } else if (r.cssRules) walk(r.cssRules); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* cross-origin */ } }
    const out = {};
    for (const c of conds) { try { out[c] = window.matchMedia(c).matches; } catch { /* invalid */ } }
    return out;
  });
}

test.describe("Breakpoint boundaries", () => {
  test("layout is stable at the edge and when crossing it live", async ({ qa, page }) => {
    const w = qa.viewport.width;
    const partner = partnerOf(w);
    await qa.boot();
    await drawFixtureScene(qa);
    const attrHere = await page.evaluate(() => document.documentElement.dataset.viewport);
    expect(attrHere, `data-viewport at ${w}px`).toBe(viewportClassFor(w));
    const here = await mediaFingerprint(page);
    await qa.checkpoint(`edge-${w}`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });

    if (partner !== w) {
      await resizeTo(page, partner, qa.viewport.height);
      await expect(page.locator(SEL.excalidraw).first()).toBeVisible();
      const attrThere = await page.evaluate(() => document.documentElement.dataset.viewport);
      expect.soft(attrThere, `data-viewport after crossing ${w}->${partner}px`).toBe(viewportClassFor(partner));
      const there = await mediaFingerprint(page);
      const flips = Object.keys(here).filter((k) => here[k] !== there[k]);
      qa.record({ category: "layout", severity: "P3", message: `Crossing ${w}px -> ${partner}px flips ${flips.length} width media condition(s)${flips.length ? ": " + flips.slice(0, 6).join(" ; ") : ""}`, details: { from: w, to: partner, flips, viewportClassFrom: attrHere, viewportClassTo: attrThere } }, `cross-${w}-${partner}`);
      await qa.checkpoint(`crossed-${partner}`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
      await resizeTo(page, w, qa.viewport.height);
      await qa.checkpoint(`returned-${w}`, { checks: ["overflow", "clipping", "overlap"], baseline: false });
    }
  });
});
