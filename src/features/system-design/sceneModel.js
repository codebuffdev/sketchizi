// Maps system design nodes/edges onto native Excalidraw elements.
//
// Nodes are rectangles and edges are arrows carrying `customData.sketchiziSystemDesign`.
// Because they are ordinary scene elements, tabs, undo/redo, IndexedDB persistence,
// recovery and collaboration need no special handling. This module is pure.

import { createNodeMeta, getPrimitive, ACCENTS, HEALTH_OVERRIDES, PROTOCOLS } from "./primitives.js";
import { choosePorts, routeOrthogonal } from "./orthogonalRouter.js";

export const CUSTOM_KEY = "sketchiziSystemDesign";
export const NODE_SIZE = Object.freeze({ width: 200, height: 84 });

export function isSystemDesignNode(element) {
  return Boolean(element && !element.isDeleted && element.type === "rectangle" && element.customData?.[CUSTOM_KEY]?.role === "node");
}

export function isSystemDesignEdge(element) {
  return Boolean(element && !element.isDeleted && element.type === "arrow" && element.customData?.[CUSTOM_KEY]?.role === "edge");
}

export function hasSystemDesignContent(elements) {
  return (elements || []).some(isSystemDesignNode);
}

function sanitizeMeta(meta) {
  const primitive = getPrimitive(meta?.kind);
  if (!primitive) return null;
  const num = (value, fallback, min = 0, max = Infinity) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    ...createNodeMeta(primitive.kind),
    label: typeof meta.label === "string" && meta.label.trim() ? meta.label.slice(0, 60) : primitive.label,
    accent: ACCENTS.includes(meta.accent) ? meta.accent : primitive.accent,
    protocol: PROTOCOLS.includes(meta.protocol) ? meta.protocol : primitive.defaultProtocol,
    replicas: Math.round(num(meta.replicas, primitive.replicas, 0, 500)),
    capacityPerReplica: Math.round(num(meta.capacityPerReplica, primitive.capacityPerReplica, 1, 1_000_000)),
    cacheHitRate: num(meta.cacheHitRate, primitive.cacheHitRate, 0, 1),
    port: Math.round(num(meta.port, primitive.port, 1, 65535)),
    health: HEALTH_OVERRIDES.includes(meta.health) ? meta.health : "healthy",
    image: typeof meta.image === "string" && meta.image ? meta.image : primitive.image,
    subtitle: typeof meta.subtitle === "string" ? meta.subtitle : primitive.subtitle,
  };
}

const NEUTRAL = { strokeColor: "#94a3b8", backgroundColor: "transparent" };

/** Excalidraw element skeleton for a node. Visuals are drawn by the overlay; the rectangle is the hit-target + anchor. */
export function createNodeSkeleton(kind, position, overrides = {}, id) {
  const meta = createNodeMeta(kind, overrides);
  return {
    ...(id ? { id } : {}),
    type: "rectangle",
    x: position.x,
    y: position.y,
    width: NODE_SIZE.width,
    height: NODE_SIZE.height,
    roundness: { type: 3, value: 14 },
    ...NEUTRAL,
    strokeWidth: 1,
    roughness: 0,
    opacity: 100,
    customData: { [CUSTOM_KEY]: { role: "node", version: 1, meta } },
  };
}

export function readNode(element) {
  if (!isSystemDesignNode(element)) return null;
  const meta = sanitizeMeta(element.customData[CUSTOM_KEY].meta);
  if (!meta) return null;
  return { id: element.id, x: element.x, y: element.y, width: element.width, height: element.height, ...meta };
}

export function readEdge(element) {
  if (!isSystemDesignEdge(element)) return null;
  const data = element.customData[CUSTOM_KEY];
  if (!data.from || !data.to) return null;
  return {
    id: element.id,
    from: data.from,
    to: data.to,
    fromPort: data.fromPort || "right",
    toPort: data.toPort || "left",
    protocol: PROTOCOLS.includes(data.protocol) ? data.protocol : "HTTPS",
    lineStyle: data.lineStyle === "dashed" ? "dashed" : "solid",
  };
}

/** Graph view of a scene. Edges whose endpoints were deleted are dropped. */
export function readGraph(elements) {
  const nodes = (elements || []).map(readNode).filter(Boolean);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (elements || []).map(readEdge).filter((edge) => edge && ids.has(edge.from) && ids.has(edge.to));
  return { nodes, edges };
}

/** Patch for updateScene: merge meta into an element's customData (keeps role/version). */
export function metaPatch(element, partialMeta) {
  const data = element.customData?.[CUSTOM_KEY] || {};
  const next = { ...data, meta: sanitizeMeta({ ...data.meta, ...partialMeta }) };
  return { customData: { ...element.customData, [CUSTOM_KEY]: next } };
}

export function edgePatch(element, partial) {
  const data = element.customData?.[CUSTOM_KEY] || {};
  return { customData: { ...element.customData, [CUSTOM_KEY]: { ...data, ...partial } } };
}

/** Geometry patch (x, y, width, height, points) for an arrow so Excalidraw's own element mirrors the routed path. */
export function arrowGeometry(fromRect, fromPort, toRect, toPort) {
  const route = routeOrthogonal(fromRect, fromPort, toRect, toPort);
  const origin = route[0];
  const points = route.map((p) => [p.x - origin.x, p.y - origin.y]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    route,
    patch: {
      x: origin.x,
      y: origin.y,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points,
    },
  };
}

export function createEdgeSkeleton(fromNode, toNode, options = {}, id) {
  const ports = options.fromPort && options.toPort ? options : choosePorts(fromNode, toNode);
  const { patch } = arrowGeometry(fromNode, ports.fromPort, toNode, ports.toPort);
  return {
    ...(id ? { id } : {}),
    type: "arrow",
    ...patch,
    strokeColor: "#94a3b8",
    strokeWidth: 1,
    roughness: 0,
    endArrowhead: null,
    startArrowhead: null,
    customData: {
      [CUSTOM_KEY]: {
        role: "edge",
        version: 1,
        from: fromNode.id,
        to: toNode.id,
        fromPort: ports.fromPort,
        toPort: ports.toPort,
        protocol: options.protocol || fromNode.protocol || "HTTPS",
        lineStyle: options.lineStyle === "dashed" ? "dashed" : "solid",
      },
    },
  };
}

/** Serialise only the system design slice of a scene (what IndexedDB persists inside the sketch). */
export function serializeSystemDesign(elements) {
  const { nodes, edges } = readGraph(elements);
  return JSON.stringify({ version: 1, nodes, edges });
}

export function deserializeSystemDesign(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed || parsed.version !== 1) throw new Error("Unsupported system design payload");
  return {
    nodes: (parsed.nodes || []).map((node) => ({ ...node, ...sanitizeMeta(node) })),
    edges: (parsed.edges || []).filter((edge) => edge?.id && edge.from && edge.to),
  };
}
