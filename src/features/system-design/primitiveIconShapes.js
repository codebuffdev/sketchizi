// Minimal line icons for the system design primitives. Pure data (no React) so `node --test` can validate it.
//
// Every icon is authored on a 24x24 grid and rendered at 16x16 with a 1.75 stroke, `currentColor`, round caps/joins,
// i.e. the same construction as Lucide. They are inlined (not imported from `lucide-react`) because that package is
// not a dependency of Sketchizi and adding one only for 20 glyphs is not worth the bundle cost.
//
// Shape tuples: [tag, attributes]. Only the tags below are allowed (enforced by tests and by PrimitiveIcon).

export const ICON_TAGS = Object.freeze(["path", "rect", "circle", "ellipse", "polyline", "polygon"]);

export const ICON_SHAPES = Object.freeze({
  // --- Edge & Entry
  smartphone: [["rect", { x: 6, y: 2, width: 12, height: 20, rx: 2.5 }], ["path", { d: "M11 18.5h2" }]],
  cloud: [["path", { d: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" }]],
  globe: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M2 12h20" }], ["path", { d: "M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" }]],
  gateway: [["path", { d: "M3 12h12" }], ["path", { d: "m10 7 5 5-5 5" }], ["path", { d: "M20 4v16" }]],
  balancer: [
    ["circle", { cx: 12, cy: 5, r: 2 }], ["circle", { cx: 5, cy: 19, r: 2 }], ["circle", { cx: 12, cy: 19, r: 2 }], ["circle", { cx: 19, cy: 19, r: 2 }],
    ["path", { d: "M12 7v3" }], ["path", { d: "M5 17v-4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4" }], ["path", { d: "M12 12v5" }],
  ],
  // --- Compute & Services
  cpu: [
    ["rect", { x: 5, y: 5, width: 14, height: 14, rx: 2 }], ["rect", { x: 9, y: 9, width: 6, height: 6, rx: 1 }],
    ["path", { d: "M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" }],
  ],
  clock: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 6.5V12l3.5 2" }]],
  braces: [
    ["path", { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" }],
    ["path", { d: "M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" }],
  ],
  shield: [["path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" }], ["path", { d: "m9 12 2 2 4-4" }]],
  // --- Data & Caching
  database: [
    ["ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }], ["path", { d: "M3 5v14a9 3 0 0 0 18 0V5" }], ["path", { d: "M3 12a9 3 0 0 0 18 0" }],
  ],
  "database-nosql": [
    ["ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }], ["path", { d: "M3 5v14a9 3 0 0 0 18 0V5" }], ["path", { d: "M8 12.5h.01M12 14h.01M16 12.5h.01" }],
  ],
  zap: [["polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2" }]],
  archive: [["rect", { x: 2, y: 3, width: 20, height: 5, rx: 1 }], ["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }], ["path", { d: "M10 12h4" }]],
  search: [["circle", { cx: 11, cy: 11, r: 7.5 }], ["path", { d: "m21 21-4.3-4.3" }]],
  // --- Messaging & Observability
  "arrows-lr": [["path", { d: "m16 3 4 4-4 4" }], ["path", { d: "M20 7H4" }], ["path", { d: "m8 21-4-4 4-4" }], ["path", { d: "M4 17h16" }]],
  activity: [["polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }]],

  // --- UI glyphs used by the studio chrome (same construction, same 16x16 render size)
  play: [["polygon", { points: "6 4 20 12 6 20 6 4" }]],
  pause: [["rect", { x: 6, y: 4, width: 4, height: 16, rx: 1 }], ["rect", { x: 14, y: 4, width: 4, height: 16, rx: 1 }]],
  stop: [["rect", { x: 5, y: 5, width: 14, height: 14, rx: 2 }]],
  layers: [["polygon", { points: "12 2 2 7 12 12 22 7 12 2" }], ["polyline", { points: "2 17 12 22 22 17" }], ["polyline", { points: "2 12 12 17 22 12" }]],
  copy: [["rect", { x: 9, y: 9, width: 12, height: 12, rx: 2 }], ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]],
  download: [["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["path", { d: "m7 10 5 5 5-5" }], ["path", { d: "M12 15V3" }]],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  expand: [["path", { d: "M15 3h6v6" }], ["path", { d: "M9 21H3v-6" }], ["path", { d: "m21 3-7 7" }], ["path", { d: "m3 21 7-7" }]],
  shrink: [["path", { d: "M4 14h6v6" }], ["path", { d: "M20 10h-6V4" }], ["path", { d: "m14 10 7-7" }], ["path", { d: "m3 21 7-7" }]],
  plus: [["path", { d: "M12 5v14M5 12h14" }]],
  close: [["path", { d: "M18 6 6 18M6 6l12 12" }]],
  chevronDown: [["path", { d: "m6 9 6 6 6-6" }]],
  chevronUp: [["path", { d: "m18 15-6-6-6 6" }]],
  trash: [["path", { d: "M3 6h18" }], ["path", { d: "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" }], ["path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }]],
  layout: [["rect", { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ["rect", { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ["path", { d: "M10 6.5h4a3 3 0 0 1 3 3V14" }]],
  grid: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "M3 9h18M3 15h18M9 3v18M15 3v18" }]],
  code: [["path", { d: "m16 18 6-6-6-6" }], ["path", { d: "m8 6-6 6 6 6" }]],
});

export function hasIconShape(name) {
  return Object.prototype.hasOwnProperty.call(ICON_SHAPES, name);
}
