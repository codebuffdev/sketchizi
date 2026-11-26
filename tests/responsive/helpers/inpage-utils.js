/**
 * Runs INSIDE the page (serialised with Function#toString and installed as an
 * init script by inpage.js). Must stay self-contained: no imports/closures.
 */
export function installUtils() {
  const qa = (window.__qa = window.__qa || {});
  const GLOBAL_IGNORE = ["[aria-hidden='true']", "[inert]", "input[type=file]", ".sr-only", ".visually-hidden"];

  const utils = {
    round(n) { return Math.round(n * 10) / 10; },
    rectOf(el) {
      const r = el.getBoundingClientRect();
      return { x: utils.round(r.x), y: utils.round(r.y), width: utils.round(r.width), height: utils.round(r.height), right: utils.round(r.right), bottom: utils.round(r.bottom) };
    },
    path(el) {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 4 && node !== document.body) {
        let part = node.tagName.toLowerCase();
        if (node.id) { parts.unshift(`${part}#${node.id}`); break; }
        const cls = (typeof node.className === "string" ? node.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) part += "." + cls.join(".");
        const label = node.getAttribute && node.getAttribute("aria-label");
        if (label && parts.length === 0) part += `[aria-label="${label.slice(0, 40)}"]`;
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(" > ");
    },
    label(el) {
      return (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    },
    matchesAny(el, selectors) {
      if (!selectors || !selectors.length) return false;
      try { return el.matches(selectors.join(",")); } catch (e) { return false; }
    },
    isIgnored(el, extra) {
      const list = GLOBAL_IGNORE.concat(extra || []);
      try { return Boolean(el.closest(GLOBAL_IGNORE.join(","))) || (extra && extra.length ? el.matches(extra.join(",")) : false); } catch (e) { return false; }
    },
    /** Rendered, non-transparent, non-zero box that is not hidden by CSS. */
    isRendered(el) {
      if (!(el instanceof Element)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      let p = el.parentElement;
      while (p) {
        const pcs = getComputedStyle(p);
        if (pcs.display === "none" || pcs.visibility === "hidden" || parseFloat(pcs.opacity) === 0) return false;
        p = p.parentElement;
      }
      return true;
    },
    /** Ancestors that clip or scroll their content (excluding html/body). */
    clippingAncestors(el) {
      const out = [];
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        const ox = cs.overflowX, oy = cs.overflowY;
        const clips = (v) => v === "auto" || v === "scroll" || v === "hidden" || v === "clip";
        if (clips(ox) || clips(oy)) {
          out.push({ el: p, scrollX: ox === "auto" || ox === "scroll", scrollY: oy === "auto" || oy === "scroll", hiddenX: ox === "hidden" || ox === "clip", hiddenY: oy === "hidden" || oy === "clip" });
        }
        p = p.parentElement;
      }
      return out;
    },
    intersect(a, b) {
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
      const w = x2 - x1, h = y2 - y1;
      return w > 0 && h > 0 ? { x: x1, y: y1, width: w, height: h, area: w * h } : null;
    },
    /**
     * Rect actually painted after ancestor clipping. null = fully clipped away.
     */
    visibleRect(el) {
      const r = el.getBoundingClientRect();
      let vis = { x: r.x, y: r.y, width: r.width, height: r.height };
      for (const anc of utils.clippingAncestors(el)) {
        const ar = anc.el.getBoundingClientRect();
        const hit = utils.intersect(vis, { x: ar.x, y: ar.y, width: ar.width, height: ar.height });
        if (!hit) return null;
        vis = hit;
      }
      return vis;
    },
    /**
     * IMPORTANT: under isMobile emulation Chromium inflates window.innerWidth /
     * innerHeight to the content size when content overflows, which would mask
     * the very overflow we are looking for. The size configured by Playwright
     * (window.__qa.expected, set by runDetector) is the source of truth.
     */
    viewport() {
      const vv = window.visualViewport;
      const exp = qa.expected;
      return {
        width: exp ? exp.width : window.innerWidth,
        height: exp ? exp.height : window.innerHeight,
        rawInnerWidth: window.innerWidth,
        rawInnerHeight: window.innerHeight,
        vvWidth: vv ? vv.width : window.innerWidth,
        vvHeight: vv ? vv.height : window.innerHeight,
      };
    },
    queryVisible(selector, opts) {
      const out = [];
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(selector)); } catch (e) { return out; }
      for (const el of nodes) {
        if (utils.isIgnored(el, opts && opts.ignore)) continue;
        if (!utils.isRendered(el)) continue;
        out.push(el);
      }
      return out;
    },
  };
  qa.utils = utils;
}
