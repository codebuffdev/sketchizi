import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";

/** In-page: silently truncated or spilling text. */
export function inPageTextClipping(opts) {
  const u = window.__qa.utils;
  const out = [];
  let intentional = 0;
  const nodes = Array.from(document.querySelectorAll(opts.selector || "body *"));
  for (const el of nodes) {
    if (out.length >= (opts.max || 50)) break;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "svg" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "CANVAS") continue;
    if (u.isIgnored(el, opts.ignore)) continue;
    if (el.closest("svg")) continue;
    // Needs its own text node.
    let hasText = false;
    for (const n of el.childNodes) { if (n.nodeType === 3 && n.nodeValue.trim().length > 0) { hasText = true; break; } }
    if (!hasText) continue;
    if (!u.isRendered(el)) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    if (dx <= 1 && dy <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline") continue; // inline boxes report 0 client size
    const ox = cs.overflowX, oy = cs.overflowY;
    const scrollable = (ox === "auto" || ox === "scroll") && dx > 1 || (oy === "auto" || oy === "scroll") && dy > 1;
    if (scrollable) { intentional += 1; continue; }
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
    if (clamp || (cs.textOverflow === "ellipsis" && dx > 1 && dy <= 1)) { intentional += 1; continue; }
    const clipsX = ox === "hidden" || ox === "clip";
    const clipsY = oy === "hidden" || oy === "clip";
    let kind = null;
    if (dx > 1 && clipsX) kind = "clipped-x";
    else if (dy > 1 && clipsY) kind = "clipped-y";
    else if (dx > 1 && (cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre")) kind = "spills-x";
    if (!kind) continue;
    out.push({
      kind,
      selector: u.path(el),
      rect: u.rectOf(el),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      scroll: { w: el.scrollWidth, h: el.scrollHeight },
      client: { w: el.clientWidth, h: el.clientHeight },
    });
  }
  return { intentional, clipped: out };
}

export async function detectTextClipping(page, { selector, ignore = [], max = 50 } = {}) {
  const res = await runDetector(page, "textClipping", { selector, ignore, max });
  const findings = res.clipped.map((c) => makeFinding({
    category: "text-clipping",
    severity: "P2",
    message: `Text ${c.kind === "spills-x" ? "overflows its box" : "is clipped without ellipsis"}: "${c.text}" (content ${c.scroll.w}×${c.scroll.h} in ${c.client.w}×${c.client.h})`,
    selector: c.selector,
    rect: c.rect,
    details: c,
  }));
  return { result: res, findings };
}
