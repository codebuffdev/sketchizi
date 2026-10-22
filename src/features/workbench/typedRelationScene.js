/** Helpers for promoting an existing Excalidraw arrow to a semantic Workbench relation. */

// Keep connector color semantic and restrained: color is a quick visual cue,
// while the persisted relation kind remains the source of truth.
const RELATION_COLORS = Object.freeze({
  calls: "#4778c7",
  exposes: "#7957b5",
  reads: "#26867b",
  "contains-table": "#26867b",
  writes: "#bd7b32",
  publishes: "#a65a9e",
  subscribes: "#a65a9e",
  "deploys-to": "#64748b",
  "authenticates-with": "#b45365",
  implements: "#7957b5",
  extends: "#7957b5",
  uses: "#4778c7",
  "maps-to": "#26867b",
  handles: "#7957b5",
  "depends-on": "#737b8c",
});

export function relationVisualStyle(kind) {
  return { strokeColor: RELATION_COLORS[kind] || RELATION_COLORS["depends-on"], strokeWidth: 2, roughness: 0, endArrowhead: "arrow" };
}
function elementEndpoint(element, index) {
  const point = Array.isArray(element?.points) ? element.points[index] : null;
  if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(element?.x) || !Number.isFinite(element?.y)) return null;
  return { x: element.x + point[0], y: element.y + point[1] };
}

function pointNearShape(point, shape, margin = 24) {
  if (!point || !shape || ![shape.x, shape.y, shape.width, shape.height].every(Number.isFinite)) return false;
  return point.x >= shape.x - margin && point.x <= shape.x + shape.width + margin
    && point.y >= shape.y - margin && point.y <= shape.y + shape.height + margin;
}

function isEligibleArrow(element, viewId) {
  if (!element || element.isDeleted || element.type !== "arrow") return false;
  const workbench = element.customData?.workbench;
  if (workbench?.relationId) return false;
  if (workbench?.viewId && viewId && workbench.viewId !== viewId) return false;
  return true;
}

/**
 * Prefer explicit Excalidraw endpoint bindings. If an arrow has no bindings,
 * reuse it only when its geometry has one unambiguous source-to-target match.
 * It never reuses a semantic relation or an arrow from another view.
 */
export function findReusableVisualArrow(elements, sourceShape, targetShape, viewId) {
  if (!Array.isArray(elements) || !sourceShape?.id || !targetShape?.id) return -1;
  const eligible = elements.map((element, index) => ({ element, index })).filter(({ element }) => isEligibleArrow(element, viewId));
  const boundMatches = eligible.filter(({ element }) =>
    element.startBinding?.elementId === sourceShape.id && element.endBinding?.elementId === targetShape.id);
  if (boundMatches.length === 1) return boundMatches[0].index;
  if (boundMatches.length > 1) return -1;

  const geometricMatches = eligible.filter(({ element }) => {
    if (element.startBinding?.elementId || element.endBinding?.elementId) return false;
    const start = elementEndpoint(element, 0);
    const end = elementEndpoint(element, (element.points?.length || 0) - 1);
    return pointNearShape(start, sourceShape) && pointNearShape(end, targetShape);
  });
  return geometricMatches.length === 1 ? geometricMatches[0].index : -1;
}

export function attachWorkbenchRelationToArrow(element, { relationId, viewId, kind }) {
  if (!element || element.type !== "arrow") throw new TypeError("A visual arrow is required to attach a Workbench relation.");
  if (!relationId || !viewId || !kind) throw new TypeError("relationId, viewId, and kind are required.");
  return {
    ...element,
    ...relationVisualStyle(kind),
    customData: {
      ...(element.customData || {}),
      workbench: { ...(element.customData?.workbench || {}), relationId, viewId, role: "relation", kind },
    },
  };
}
