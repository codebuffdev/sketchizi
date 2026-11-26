/**
 * Preset dock shapes as plain Excalidraw element skeletons.
 *
 * Everything here is standard `line` / `ellipse` / `rectangle` JSON: it
 * persists, exports and syncs like any hand-drawn element. No custom element
 * types and no Excalidraw internals.
 *
 * Lines are closed by repeating the first point. `backgroundColor` is
 * transparent by default; fill is applied from the properties panel (whether a
 * closed `line` renders a fill depends on the pinned Excalidraw build).
 */

export const PRESET_DEFAULT_SIZE = Object.freeze({ width: 160, height: 140 });

const INK = "#1e1e1e";
const NOTE_FILL = "#fff3a3";

const lineBase = (x, y, points, extra = {}) => ({
  type: "line",
  x,
  y,
  points,
  strokeColor: INK,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  roughness: 1,
  opacity: 100,
  ...extra,
});

/** Closed point lists in local (0,0)-based coordinates. */
export function presetPoints(kind, w, h) {
  switch (kind) {
    case "triangle":
      // Apex above the origin line, so the bounding box spans y = -h .. 0.
      return [[0, 0], [w / 2, -h], [w, 0], [0, 0]];
    case "hexagon":
      return [[w * 0.25, 0], [w * 0.75, 0], [w, h * 0.5], [w * 0.75, h], [w * 0.25, h], [0, h * 0.5], [w * 0.25, 0]];
    case "funnel":
      return [[0, 0], [w, 0], [w * 0.62, h * 0.56], [w * 0.62, h * 0.92], [w * 0.38, h], [w * 0.38, h * 0.56], [0, 0]];
    case "cylinder-body": {
      const ry = cylinderCapRadius(h);
      return [[0, ry], [0, h - ry], [w * 0.5, h], [w, h - ry], [w, ry]];
    }
    default:
      return null;
  }
}

export const cylinderCapRadius = (h) => Math.max(8, Math.round(h * 0.14));

/**
 * Skeletons for one preset centred on (cx, cy). `groupId` is required for the
 * two-element cylinder and is attached by the inserter after conversion.
 */
export function buildPresetSkeleton(kind, { cx = 0, cy = 0, width = PRESET_DEFAULT_SIZE.width, height = PRESET_DEFAULT_SIZE.height } = {}) {
  const left = cx - width / 2;
  const top = cy - height / 2;
  switch (kind) {
    case "triangle":
      return [lineBase(left, top + height, presetPoints("triangle", width, height))];
    case "hexagon":
      return [lineBase(left, top, presetPoints("hexagon", width, height))];
    case "funnel":
      return [lineBase(left, top, presetPoints("funnel", width, height))];
    case "cylinder": {
      const ry = cylinderCapRadius(height);
      return [
        {
          type: "ellipse", x: left, y: top, width, height: ry * 2,
          strokeColor: INK, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, roughness: 1, opacity: 100,
        },
        // Round the V-shaped body into a U so it reads as a drum.
        lineBase(left, top, presetPoints("cylinder-body", width, height), { roundness: { type: 2 } }),
      ];
    }
    case "sticky-note":
      return [{
        type: "rectangle", x: cx - 90, y: cy - 70, width: 180, height: 140,
        strokeColor: "#b08900", backgroundColor: NOTE_FILL, fillStyle: "solid", strokeWidth: 1, roughness: 0, opacity: 100,
        roundness: { type: 3 },
        customData: { isNote: true },
        label: { text: "Note", fontSize: 20, strokeColor: INK },
      }];
    default:
      return [];
  }
}

export const PRESET_KINDS = Object.freeze(["triangle", "hexagon", "funnel", "cylinder", "sticky-note"]);
