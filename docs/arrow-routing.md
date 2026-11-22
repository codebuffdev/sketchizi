# Multi-point arrows & routing

- **Draw**: `A` / `L`, click points, double-click / `Enter` / `Esc` to finish (native Excalidraw
  multi-point drawing; `Esc` is no longer swallowed by connection mode).
- **Snaps on commit** (`ArrowVertexEditor.jsx`): endpoints within 14px (screen) of a
  rectangle / diamond / ellipse top-right-bottom-left port snap and bind to it; bends within ±3.5°
  of a 15° step are pulled onto it. Hold `Alt` to skip the angle snap. A badge shows `45°`, `90°`, `Port Snap`.
- **Edit**: select an arrow / line → drag any vertex; drag a ghost `+` to split a segment and pull
  out a new bend in one gesture (one undo step); double-click or `Alt+click` a bend to delete it.
- **Routing** (contextual toolbar → Stroke → Routing): `Free Polyline` (default, `elbowed:false`),
  `Curve` (`roundness:{type:2}`, spline through all points), `90° Elbow` (`elbowed:true`, orthogonal points).
- **Dot arrowheads**: the UI value `dot` is stored as `"circle"` (what Excalidraw 0.18 draws as a
  filled dot); see `arrowheads.js`.
- Pure geometry lives in `src/features/canvas/arrowRouting.js` (tests: `tests/arrow-routing.test.js`).
