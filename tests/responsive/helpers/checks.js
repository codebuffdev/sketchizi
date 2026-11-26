import { detectHorizontalOverflow } from "./overflow.js";
import { detectViewportClipping } from "./clipping.js";
import { detectTouchTargets } from "./touch-targets.js";
import { detectOverlaps } from "./overlap.js";
import { detectTextClipping } from "./text-clipping.js";
import { inspectLayout, layoutFindings, DIALOG_SELECTOR, PANEL_DEFS } from "./layout.js";
import { INTERACTIVE_SELECTOR, FLOATING_SURFACES } from "../config/selectors.js";
import { IGNORE } from "../config/ignore.js";
import { isTouchViewport } from "../config/viewports.js";

export const ALL_CHECKS = ["overflow", "clipping", "touch", "overlap", "text", "layout"];

/**
 * Runs the full automated defect detection suite against the current DOM.
 * Returns { findings, stats }. Findings are plain objects (see findings.js).
 */
export async function runChecks(page, { viewport, checks = ALL_CHECKS, scope = null, extraSurfaces = [], grids = [] } = {}) {
  const findings = [];
  const stats = {};
  const interactive = scope ? `${scope} :is(${INTERACTIVE_SELECTOR})` : INTERACTIVE_SELECTOR;
  const ignore = IGNORE.global;

  if (checks.includes("overflow")) {
    const r = await detectHorizontalOverflow(page);
    findings.push(...r.findings);
    stats.overflowBy = r.result.overflowBy;
    stats.rawInnerWidth = r.result.rawInnerWidth;
  }
  if (checks.includes("clipping")) {
    const r = await detectViewportClipping(page, { selector: interactive, ignore });
    findings.push(...r.findings);
    stats.interactiveChecked = r.result.checked;
  }
  if (checks.includes("touch") && isTouchViewport(viewport)) {
    const r = await detectTouchTargets(page, { selector: interactive, ignore, exempt: IGNORE.touchTarget });
    findings.push(...r.findings);
    stats.touchTargets = r.result.total;
    stats.touchExempted = r.result.exempted;
  }
  if (checks.includes("overlap")) {
    const r = await detectOverlaps(page, { surfaces: [...FLOATING_SURFACES, ...extraSurfaces], allowedPairs: IGNORE.overlapPairs });
    findings.push(...r.findings);
    stats.floatingSurfaces = r.result.surfaces.map((s) => s.name);
  }
  if (checks.includes("text")) {
    const r = await detectTextClipping(page, { selector: scope ? `${scope}, ${scope} *` : undefined, ignore });
    findings.push(...r.findings);
    stats.intentionalTruncation = r.result.intentional;
  }
  if (checks.includes("layout")) {
    const res = await inspectLayout(page, { dialogSelector: DIALOG_SELECTOR, panels: PANEL_DEFS, grids });
    findings.push(...layoutFindings(res, { viewport }));
    stats.dvh = res.dvh;
    stats.viewportAttr = res.viewportAttr;
    stats.grids = res.grids;
  }
  return { findings, stats };
}
