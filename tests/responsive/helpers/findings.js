/**
 * Finding schema shared by every detector, the fixture and both reporters.
 *
 *  P0  feature unusable / content unreachable
 *  P1  visible layout defect (overflow, clipped control, overlapping floating UI)
 *  P2  quality warning (undersized touch target, clipped text)
 *  P3  informational (coverage gap, exempted element, static dvh hint)
 */
export const SEVERITIES = ["P0", "P1", "P2", "P3"];

export const CATEGORIES = [
  "horizontal-overflow",
  "viewport-clipping",
  "touch-target",
  "overlap",
  "text-clipping",
  "layout",
  "dynamic-viewport",
  "keyboard",
  "runtime-error",
  "visual-regression",
  "interaction",
  "coverage-gap",
];

export function makeFinding(partial) {
  const f = {
    category: "layout",
    severity: "P2",
    message: "",
    selector: null,
    rect: null,
    details: null,
    ...partial,
  };
  if (!SEVERITIES.includes(f.severity)) throw new Error(`Invalid severity: ${f.severity}`);
  if (!CATEGORIES.includes(f.category)) throw new Error(`Invalid category: ${f.category}`);
  return f;
}

/** Stable key so JSON reports can be diffed between runs. */
export function findingKey(f) {
  return [f.viewport, f.suite, f.checkpoint, f.category, f.selector || "", f.message.replace(/\d+(\.\d+)?/g, "#")].join("|");
}

export function failThreshold(env = process.env.RESPONSIVE_FAIL_ON) {
  const v = (env || "P1").toUpperCase();
  if (v === "NONE") return null;
  return SEVERITIES.includes(v) ? v : "P1";
}

export function isFailing(finding, threshold = failThreshold()) {
  if (!threshold) return false;
  return SEVERITIES.indexOf(finding.severity) <= SEVERITIES.indexOf(threshold);
}
