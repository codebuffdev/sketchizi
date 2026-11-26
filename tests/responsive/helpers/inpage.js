import { installUtils } from "./inpage-utils.js";
import { inPageOverflow } from "./overflow.js";
import { inPageClipping } from "./clipping.js";
import { inPageTouchTargets } from "./touch-targets.js";
import { inPageOverlap } from "./overlap.js";
import { inPageTextClipping } from "./text-clipping.js";
import { inPageLayout } from "./layout.js";

/**
 * Builds one init-script that registers every detector on window.__qa.
 * Using addInitScript (not eval) keeps this working under any page CSP and
 * re-installs automatically after reloads / navigations.
 */
export function buildInPageScript() {
  const detectors = {
    overflow: inPageOverflow,
    clipping: inPageClipping,
    touchTargets: inPageTouchTargets,
    overlap: inPageOverlap,
    textClipping: inPageTextClipping,
    layout: inPageLayout,
  };
  const registrations = Object.entries(detectors)
    .map(([name, fn]) => `window.__qa.${name} = ${fn.toString()};`)
    .join("\n");
  return `(${installUtils.toString()})();\n${registrations}`;
}

export async function installInPageDetectors(contextOrPage) {
  await contextOrPage.addInitScript({ content: buildInPageScript() });
}
