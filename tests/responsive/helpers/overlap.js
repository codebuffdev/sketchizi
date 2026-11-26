import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";

/** In-page: pairwise intersection of active floating surfaces. */
export function inPageOverlap(opts) {
  const u = window.__qa.utils;
  const entries = [];
  for (const s of opts.surfaces) {
    for (const el of u.queryVisible(s.selector, {})) {
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === "none") continue;
      const pos = cs.position;
      const r = el.getBoundingClientRect();
      // Only surfaces that float (fixed/absolute/sticky) are "floating UI".
      if (pos === "static" || pos === "relative") {
        // allow relative surfaces only if they are children of a floating ancestor
        let p = el.parentElement, floating = false;
        while (p) { const pp = getComputedStyle(p).position; if (pp === "fixed" || pp === "absolute" || pp === "sticky") { floating = true; break; } p = p.parentElement; }
        if (!floating) continue;
      }
      if (el.closest("[aria-modal='true']") && !el.matches("[aria-modal='true']")) continue;
      entries.push({ name: s.name, el, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
    }
  }
  const out = [];
  const skip = new Set((opts.allowedPairs || []).map((p) => [p[0], p[1]].sort().join("|")));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.name !== b.name && skip.has([a.name, b.name].sort().join("|"))) continue;
      const hit = u.intersect(a.rect, b.rect);
      if (!hit || hit.width < (opts.minSize || 4) || hit.height < (opts.minSize || 4)) continue;
      const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height) || 1;
      out.push({
        a: { name: a.name, selector: u.path(a.el), rect: u.rectOf(a.el) },
        b: { name: b.name, selector: u.path(b.el), rect: u.rectOf(b.el) },
        intersection: { x: u.round(hit.x), y: u.round(hit.y), width: u.round(hit.width), height: u.round(hit.height) },
        ratio: Math.round((hit.area / smaller) * 100) / 100,
      });
    }
  }
  return { surfaces: entries.map((e) => ({ name: e.name, rect: e.rect })), overlaps: out };
}

export async function detectOverlaps(page, { surfaces, allowedPairs = [], minSize = 4 } = {}) {
  const res = await runDetector(page, "overlap", { surfaces, allowedPairs, minSize });
  const findings = res.overlaps.map((o) => makeFinding({
    category: "overlap",
    severity: o.ratio >= 0.1 ? "P1" : "P2",
    message: `${o.a.name} overlaps ${o.b.name} (${o.intersection.width}×${o.intersection.height}px, ${Math.round(o.ratio * 100)}% of the smaller surface)`,
    selector: `${o.a.selector}  ×  ${o.b.selector}`,
    rect: o.intersection,
    details: o,
  }));
  return { result: res, findings };
}
