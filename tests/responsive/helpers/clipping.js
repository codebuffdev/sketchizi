import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";

/** In-page: interactive elements that extend beyond the viewport. */
export function inPageClipping(opts) {
  const u = window.__qa.utils;
  const vp = u.viewport();
  const tol = opts.tolerance || 1;
  const out = [];
  let checked = 0;
  for (const el of u.queryVisible(opts.selector, { ignore: opts.ignore })) {
    const r = el.getBoundingClientRect();
    const beyond = r.left < -tol || r.top < -tol || r.right > vp.width + tol || r.bottom > vp.height + tol;
    checked += 1;
    if (!beyond) continue;
    const inter = u.intersect({ x: r.x, y: r.y, width: r.width, height: r.height }, { x: 0, y: 0, width: vp.width, height: vp.height });
    // Fully off-screen = parked drawer/sheet or virtualised row; only reported when asked.
    if (!inter && !opts.includeParked) continue;
    // Scrolled inside an intentional scroll container whose own box is on-screen.
    const anc = u.clippingAncestors(el);
    const scroller = anc.find((a) => a.scrollX || a.scrollY);
    if (scroller) {
      const sr = scroller.el.getBoundingClientRect();
      const within = sr.left >= -tol && sr.top >= -tol && sr.right <= vp.width + tol && sr.bottom <= vp.height + tol;
      if (within) continue;
    }
    // Clipped away by overflow:hidden ancestors -> not visible to the user.
    const vis = u.visibleRect(el);
    if (!vis) continue;
    const inVp = u.intersect(vis, { x: 0, y: 0, width: vp.width, height: vp.height });
    const visibleArea = inVp ? inVp.area : 0;
    const ownArea = r.width * r.height;
    const stillBeyond = vis.x < -tol || vis.y < -tol || vis.x + vis.width > vp.width + tol || vis.y + vis.height > vp.height + tol;
    if (!stillBeyond) continue;
    out.push({
      selector: u.path(el),
      label: u.label(el),
      rect: u.rectOf(el),
      viewport: { width: vp.width, height: vp.height },
      hiddenPx: {
        left: Math.max(0, Math.round(-r.left)),
        top: Math.max(0, Math.round(-r.top)),
        right: Math.max(0, Math.round(r.right - vp.width)),
        bottom: Math.max(0, Math.round(r.bottom - vp.height)),
      },
      visibleRatio: ownArea ? Math.round((visibleArea / ownArea) * 100) / 100 : 1,
    });
    if (out.length >= (opts.max || 40)) break;
  }
  return { checked, clipped: out };
}

export async function detectViewportClipping(page, { selector, ignore = [], tolerance = 1, includeParked = false, max = 40 } = {}) {
  const res = await runDetector(page, "clipping", { selector, ignore, tolerance, includeParked, max });
  const findings = res.clipped.map((c) => makeFinding({
    category: "viewport-clipping",
    // Mostly hidden controls cannot be used at all.
    severity: c.visibleRatio < 0.5 ? "P0" : "P1",
    message: `Interactive element "${c.label || "(unlabelled)"}" extends outside the viewport (L${c.hiddenPx.left} T${c.hiddenPx.top} R${c.hiddenPx.right} B${c.hiddenPx.bottom}px, ${Math.round(c.visibleRatio * 100)}% visible)`,
    selector: c.selector,
    rect: c.rect,
    details: c,
  }));
  return { result: res, findings };
}
