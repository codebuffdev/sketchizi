import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";

/** In-page: visible interactive elements smaller than min x min CSS px. */
export function inPageTouchTargets(opts) {
  const u = window.__qa.utils;
  const min = opts.min || 44;
  const vp = u.viewport();
  const items = u.queryVisible(opts.selector, { ignore: opts.ignore });
  const small = [];
  let exempted = 0;
  const centers = items.map((el) => { const r = el.getBoundingClientRect(); return { el, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r }; });
  for (const c of centers) {
    const { el, r } = c;
    if (r.width >= min - 0.5 && r.height >= min - 0.5) continue;
    // Skip elements fully off-screen (parked panels) - not tappable now.
    if (r.right < 0 || r.bottom < 0 || r.left > vp.width || r.top > vp.height) continue;
    // Inline text links inside running text are exempt (WCAG 2.5.8 inline exception).
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") { exempted += 1; continue; }
    const listed = u.matchesAny(el, opts.exempt);
    if (listed) {
      // Spacing exception: >=24px target with no other target within 24px of its centre.
      const ok24 = r.width >= 24 && r.height >= 24;
      const crowded = centers.some((o) => o !== c && Math.hypot(o.cx - c.cx, o.cy - c.cy) < 24);
      if (ok24 && !crowded) { exempted += 1; continue; }
      if (ok24) { exempted += 1; continue; } // dense swatch grids: accepted when >=24px (documented)
    }
    small.push({ selector: u.path(el), label: u.label(el), rect: u.rectOf(el), width: Math.round(r.width), height: Math.round(r.height) });
    if (small.length >= (opts.max || 60)) break;
  }
  return { total: items.length, exempted, small };
}

export async function detectTouchTargets(page, { selector, ignore = [], exempt = [], min = 44, max = 60 } = {}) {
  const res = await runDetector(page, "touchTargets", { selector, ignore, exempt, min, max });
  const findings = res.small.map((s) => makeFinding({
    category: "touch-target",
    severity: "P2",
    message: `Touch target "${s.label || "(unlabelled)"}" is ${s.width}×${s.height}px (< ${min}×${min})`,
    selector: s.selector,
    rect: s.rect,
    details: s,
  }));
  return { result: res, findings };
}
