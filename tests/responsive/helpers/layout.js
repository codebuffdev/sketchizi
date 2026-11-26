import { makeFinding } from "./findings.js";
import { runDetector } from "./run-detector.js";
import { viewportClassFor } from "../config/viewports.js";

/**
 * In-page: structural responsive checks.
 *  - dialogs/panels fit the viewport (max-height / width)
 *  - grid column counts and flex wrapping for requested containers
 *  - dynamic viewport probe (100vh vs 100dvh vs visualViewport)
 *  - static scan of live stylesheets for 100vh on currently rendered elements
 */
export function inPageLayout(opts) {
  const u = window.__qa.utils;
  const vp = u.viewport();
  const res = { viewportAttr: document.documentElement.dataset.viewport || null, vp, dialogs: [], panels: [], grids: [], dvh: null, vhRules: [] };

  for (const el of u.queryVisible(opts.dialogSelector, {})) {
    const r = u.rectOf(el);
    res.dialogs.push({ selector: u.path(el), rect: r, tooTall: r.height > vp.height + 1, tooWide: r.width > vp.width + 1, offTop: r.y < -1, offBottom: r.bottom > vp.height + 1 });
  }
  for (const p of opts.panels || []) {
    for (const el of u.queryVisible(p.selector, {})) {
      const r = u.rectOf(el);
      const cs = getComputedStyle(el);
      res.panels.push({ name: p.name, selector: u.path(el), rect: r, position: cs.position, maxHeight: cs.maxHeight, tooTall: r.height > vp.height + 1, tooWide: r.width > vp.width + 1, edgeBottom: Math.abs(r.bottom - vp.height) <= 2, edgeRight: Math.abs(r.right - vp.width) <= 2, fullWidth: r.width >= vp.width - 2 });
    }
  }
  for (const g of opts.grids || []) {
    for (const el of u.queryVisible(g.selector, {}).slice(0, 3)) {
      const cs = getComputedStyle(el);
      const cols = cs.display.includes("grid") ? cs.gridTemplateColumns.split(" ").filter((c) => c && c !== "none").length : null;
      const r = u.rectOf(el);
      res.grids.push({ name: g.name, selector: u.path(el), display: cs.display, columns: cols, flexWrap: cs.flexWrap, width: r.width, children: el.children.length });
    }
  }

  // Dynamic viewport probe.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;visibility:hidden;pointer-events:none;";
  const vh = probe.cloneNode(), dvh = probe.cloneNode(), svh = probe.cloneNode(), lvh = probe.cloneNode();
  vh.style.height = "100vh"; dvh.style.height = "100dvh"; svh.style.height = "100svh"; lvh.style.height = "100lvh";
  document.body.append(vh, dvh, svh, lvh);
  res.dvh = { vh: vh.getBoundingClientRect().height, dvh: dvh.getBoundingClientRect().height, svh: svh.getBoundingClientRect().height, lvh: lvh.getBoundingClientRect().height, visualViewportHeight: vp.vvHeight, innerHeight: vp.height };
  vh.remove(); dvh.remove(); svh.remove(); lvh.remove();

  // Static scan for 100vh in rules that match rendered elements right now.
  const seen = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && rule.constructor.name === "CSSMediaRule") { if (window.matchMedia(rule.conditionText || rule.media.mediaText).matches) walk(rule.cssRules); continue; }
      if (rule.cssRules && (rule.constructor.name === "CSSSupportsRule" || rule.constructor.name === "CSSLayerBlockRule")) { walk(rule.cssRules); continue; }
      if (!rule.style || !rule.selectorText) continue;
      for (const prop of ["height", "min-height", "max-height"]) {
        const v = rule.style.getPropertyValue(prop);
        if (v && /(^|[^d\w])100vh/.test(v) && !/100dvh/.test(v)) {
          let matched = [];
          try { matched = Array.from(document.querySelectorAll(rule.selectorText)).filter((n) => u.isRendered(n)); } catch (e) { matched = []; }
          if (!matched.length) continue;
          const key = rule.selectorText + prop;
          if (seen.has(key)) continue;
          seen.add(key);
          res.vhRules.push({ selector: rule.selectorText.slice(0, 160), property: prop, value: v, important: rule.style.getPropertyPriority(prop) === "important", matches: matched.length, sampleHeight: Math.round(matched[0].getBoundingClientRect().height) });
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) { try { walk(sheet.cssRules); } catch (e) { /* cross-origin */ } }
  res.vhRules = res.vhRules.slice(0, 25);
  return res;
}

export async function inspectLayout(page, opts) {
  return runDetector(page, "layout", opts);
}

export const DIALOG_SELECTOR = "[role=dialog], [aria-modal='true'], .sketchizi-export-modal, .design-dialog, .pages-delete-confirm-dialog, .sketchizi-command-palette";

export const PANEL_DEFS = [
  { name: "library-panel", selector: ".library-panel" },
  { name: "properties-panel", selector: ".properties-panel" },
  { name: "ai-panel", selector: ".ai-ask-panel:not([aria-hidden='true'])" },
  { name: "validation-panel", selector: ".architecture-validation-panel" },
  { name: "collab-chat", selector: ".collaboration-chat-panel" },
];

/** Turns an inspectLayout result into findings. */
export function layoutFindings(res, { viewport }) {
  const out = [];
  const expectedClass = viewportClassFor(viewport.width);
  if (res.viewportAttr && res.viewportAttr !== expectedClass) {
    out.push(makeFinding({ category: "layout", severity: "P1", message: `data-viewport="${res.viewportAttr}" but width ${viewport.width}px should be "${expectedClass}"`, selector: "html", details: { attr: res.viewportAttr, expected: expectedClass } }));
  }
  for (const d of res.dialogs) {
    if (d.tooTall || d.tooWide || d.offTop || d.offBottom) {
      out.push(makeFinding({ category: "layout", severity: "P1", message: `Dialog does not fit the viewport (${d.rect.width}×${d.rect.height} at ${d.rect.x},${d.rect.y} in ${res.vp.width}×${res.vp.height})`, selector: d.selector, rect: d.rect, details: d }));
    }
  }
  for (const p of res.panels) {
    if (p.tooTall || p.tooWide) {
      out.push(makeFinding({ category: "layout", severity: "P1", message: `${p.name} is larger than the viewport (${p.rect.width}×${p.rect.height} vs ${res.vp.width}×${res.vp.height})`, selector: p.selector, rect: p.rect, details: p }));
    }
  }
  // Dynamic viewport: flag live rules that rely on 100vh in a touch viewport.
  if (viewport.hasTouch || viewport.isMobile) {
    for (const r of res.vhRules) {
      out.push(makeFinding({
        category: "dynamic-viewport",
        severity: "P3",
        message: `${r.property}:${r.value}${r.important ? " !important" : ""} on a rendered element (${r.matches} match(es), ${r.sampleHeight}px). 100vh ignores collapsing mobile browser chrome; prefer 100dvh with a 100vh fallback.`,
        selector: r.selector,
        details: { ...r, probe: res.dvh },
      }));
    }
  }
  return out;
}
