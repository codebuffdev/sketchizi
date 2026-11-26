import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";

/** In-page: global horizontal overflow + culprit discovery. */
export function inPageOverflow(opts) {
  const u = window.__qa.utils;
  const vw = u.viewport().width;
  const root = document.documentElement;
  const body = document.body;
  const docScroll = Math.max(root.scrollWidth, body ? body.scrollWidth : 0);
  const clientW = root.clientWidth || vw;
  const overflowBy = docScroll - vw;
  const culprits = [];
  if (overflowBy > (opts.tolerance || 1)) {
    const all = document.body.querySelectorAll("*");
    for (const el of all) {
      if (culprits.length >= (opts.maxCulprits || 12)) break;
      if (u.isIgnored(el)) continue;
      if (!u.isRendered(el)) continue;
      const r = el.getBoundingClientRect();
      // Only content extending past the RIGHT edge creates scrollable overflow
      // (negative-x overflow is unreachable), and fixed boxes never scroll.
      if (r.right <= vw + 1) continue;
      let fixed = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) { if (getComputedStyle(n).position === "fixed") { fixed = true; break; } }
      if (fixed) continue;
      // An element inside an intentional horizontal scroller is not a culprit.
      const anc = u.clippingAncestors(el);
      if (anc.some((a) => a.scrollX || a.hiddenX)) continue;
      // Skip children of an already reported culprit.
      if (culprits.some((c) => c.__el && c.__el.contains(el))) continue;
      culprits.push({ __el: el, selector: u.path(el), rect: u.rectOf(el), label: u.label(el) });
    }
  }
  return {
    innerWidth: vw,
    rawInnerWidth: window.innerWidth,
    scrollWidth: docScroll,
    clientWidth: clientW,
    overflowBy,
    culprits: culprits.map((c) => ({ selector: c.selector, rect: c.rect, label: c.label })),
  };
}

export async function detectHorizontalOverflow(page, { tolerance = 1, maxCulprits = 12 } = {}) {
  const res = await runDetector(page, "overflow", { tolerance, maxCulprits });
  const findings = [];
  if (res.overflowBy > tolerance) {
    const top = res.culprits[0];
    findings.push(makeFinding({
      category: "horizontal-overflow",
      severity: "P1",
      message: `Document scrolls horizontally: scrollWidth ${res.scrollWidth}px > viewport ${res.innerWidth}px (by ${res.overflowBy}px)`,
      selector: top ? top.selector : "html",
      rect: top ? top.rect : null,
      details: res,
    }));
  }
  return { result: res, findings };
}
