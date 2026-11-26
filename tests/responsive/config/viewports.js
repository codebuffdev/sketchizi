/**
 * Single source of truth for the responsive matrix.
 *
 * FULL_VIEWPORTS  - the 14 required device viewports.
 * SMOKE_VIEWPORTS - 4 representative widths for fast local iteration.
 * BOUNDARY_PAIRS  - the 10 required CSS breakpoint edges (5 pairs).
 * DISCOVERED_EXTRA_PAIRS - extra edges found in the real stylesheets (opt-in).
 *
 * The app does NOT use one breakpoint system. Discovered in src CSS:
 *   760/761 (most common), 520/521, 640/641, 900/901, 1024/1025, 1100,
 *   767.98/768 (responsive-fluid.css + responsiveShell.js: phone <768,
 *   tablet <1024). Run `npm run test:responsive:discover` to regenerate.
 */
export const FULL_VIEWPORTS = [
  { id: "320x568", name: "Small Mobile", width: 320, height: 568, isMobile: true, hasTouch: true },
  { id: "360x800", name: "Android Mobile", width: 360, height: 800, isMobile: true, hasTouch: true },
  { id: "375x812", name: "iPhone-sized", width: 375, height: 812, isMobile: true, hasTouch: true },
  { id: "390x844", name: "Modern Mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: "414x896", name: "Large Mobile", width: 414, height: 896, isMobile: true, hasTouch: true },
  { id: "600x900", name: "Small Tablet", width: 600, height: 900, isMobile: true, hasTouch: true },
  { id: "768x1024", name: "Tablet Portrait", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { id: "820x1180", name: "iPad-sized", width: 820, height: 1180, isMobile: true, hasTouch: true },
  { id: "1024x768", name: "Tablet Landscape", width: 1024, height: 768, isMobile: false, hasTouch: true },
  { id: "1280x800", name: "Laptop 1280", width: 1280, height: 800, isMobile: false, hasTouch: false },
  { id: "1366x768", name: "Laptop 1366", width: 1366, height: 768, isMobile: false, hasTouch: false },
  { id: "1440x900", name: "Desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { id: "1920x1080", name: "Large Desktop", width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { id: "2560x1440", name: "Ultra-wide", width: 2560, height: 1440, isMobile: false, hasTouch: false },
];

export const SMOKE_IDS = ["375x812", "768x1024", "1440x900", "2560x1440"];
export const SMOKE_VIEWPORTS = FULL_VIEWPORTS.filter((v) => SMOKE_IDS.includes(v.id));

/** Required boundary pairs: [last width below the edge, first width at/above it]. */
export const BOUNDARY_PAIRS = [
  [520, 521],
  [760, 761],
  [767, 768],
  [1023, 1024],
  [1099, 1100],
];
export const BOUNDARY_WIDTHS = BOUNDARY_PAIRS.flat();

/** Extra edges found in the real CSS (opt-in with RESPONSIVE_EXTRA_BOUNDARIES=1). */
export const DISCOVERED_EXTRA_PAIRS = [
  [640, 641],
  [900, 901],
  [1024, 1025],
];

export const BOUNDARY_HEIGHT = 800;

export function boundaryViewport(width) {
  return {
    id: `bp-${width}`,
    name: `Boundary ${width}px`,
    width,
    height: BOUNDARY_HEIGHT,
    isMobile: width <= 767,
    hasTouch: width < 1024,
    boundary: true,
  };
}

/** Mirrors src/features/device/responsiveShell.js (the data-viewport attribute). */
export function viewportClassFor(width) {
  return width < 768 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

export function isTouchViewport(vp) {
  return Boolean(vp.hasTouch || vp.isMobile);
}

export function selectViewports(profile = process.env.RESPONSIVE_PROFILE || "full") {
  const only = (process.env.RESPONSIVE_VIEWPORTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length) return FULL_VIEWPORTS.filter((v) => only.includes(v.id));
  return profile === "smoke" ? SMOKE_VIEWPORTS : FULL_VIEWPORTS;
}

export function selectBoundaries(profile = process.env.RESPONSIVE_PROFILE || "full") {
  if (profile === "smoke") return [];
  const pairs = process.env.RESPONSIVE_EXTRA_BOUNDARIES === "1" ? [...BOUNDARY_PAIRS, ...DISCOVERED_EXTRA_PAIRS] : BOUNDARY_PAIRS;
  return pairs.flat().map(boundaryViewport);
}
