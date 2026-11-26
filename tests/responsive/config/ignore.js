/**
 * Elements the detectors must not report. Keep entries narrow and documented;
 * every ignore hides a potential defect.
 */
export const IGNORE = {
  // Never evaluated by any detector.
  global: [
    "[aria-hidden='true']",
    "[inert]",
    ".excalidraw .visually-hidden",
    "input[type=file]",
    ".sr-only",
    ".visually-hidden",
  ],
  // Touch-target exemptions (WCAG 2.5.8 spacing exception / inline text links).
  touchTarget: [
    ".style-swatch",
    ".format-option-swatch",
    ".sk-tool-color-swatch",
    ".sk-tool-color-dot",
    ".swatch-row button",
    "p a, li a, .community-footer a",
  ],
  // Elements allowed to overlap their sibling floating UI on purpose.
  overlapPairs: [
    ["tabs-bar", "tab-menus"],
    ["contextual-dock", "properties-toggle"],
  ],
  // Console noise that is not an app defect (mirrors e2e/smoke.spec.js).
  consoleErrors: [/Failed to load resource/i, /\/api\//i, /favicon/i, /ResizeObserver loop/i, /net::ERR_FAILED/i],
};
