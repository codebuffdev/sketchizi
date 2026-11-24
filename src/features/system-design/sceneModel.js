// Maps system design nodes/edges onto native Excalidraw elements.
//
// Nodes are rectangles and edges are arrows carrying `customData.sketchiziSystemDesign`.
// Because they are ordinary scene elements, tabs, undo/redo, IndexedDB persistence,
// recovery and collaboration need no special handling. This module is pure.
//
// SINGLE VISUAL CONTRACT: the React overlay is the only thing that *draws* a node or connector. The native Excalidraw
// rectangle/arrow is an invisible hit-target (opacity 0) that still gives us native selection, drag, resize, undo and
// multi-select, with exactly one selection box. Drawing both is what produced the "smaller duplicate card" bug.

import { createNodeMeta, getPrimitive, ACCENTS, HEALTH_OVERRIDES, PROTOCOLS } from "./primitives.js";
import { choosePorts, routeOrthogonal } from "./orthogonalRouter.js";

export const CUSTOM_KEY = "sketchiziSystemDesign";
export const NODE_SIZE = Object.freeze({ width: 204, height: 88 });

export function isSystemDesignNode(element) {
  return Boolean(element && !element.isDeleted && element.type === "rectangle" && element.customData?.[CUSTOM_KEY]?.role === "node");
}

export function isSystemDesignEdge(element) {
  return Boolean(element && !element.isDeleted && element.type === "arrow" && element.customData?.[CUSTOM_KEY]?.role === "edge");
}

export function hasSystemDesignContent(elements) {
  return (elements || []).some(isSystemDesignNode);
}

function sanitizeCustomIcon(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.slice(0, 180) : "";
  const name = typeof value.name === "string" ? value.name.slice(0, 100) : "";
  const src = typeof value.src === "string" && /^(https?:|data:image\\/svg\\+xml)/i.test(value.src) ? value.src.slice(0, 12000) : "";
  if (!id || !name || !src) return null;
  return {
    id, name, src,
    ...(typeof value.source === "string" ? { source: value.source.slice(0, 40) } : {}),
    ...(typeof value.category === "string" ? { category: value.category.slice(0, 80) } : {}),
    ...(typeof value.svgPath === "string" ? { svgPath: value.svgPath.slice(0, 4000) } : {}),
  };
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
    manualRps: Math.round(num(meta.manualRps, 0, 0, 1_000_000_000)),
    baseLatencyMs: num(meta.baseLatencyMs, primitive.baseLatencyMs, 0.5, 60000),
    cacheHitRate: num(meta.cacheHitRate, primitive.cacheHitRate, 0, 1),
    port: Math.round(num(meta.port, primitive.port, 1, 65535)),
    health: HEALTH_OVERRIDES.includes(meta.health) ? meta.health : "healthy",
    image: typeof meta.image === "string" && meta.image ? meta.image : primitive.image,
    subtitle: typeof meta.subtitle === "string" ? meta.subtitle : primitive.subtitle,
    customIcon: sanitizeCustomIcon(meta.customIcon),
  };
}

// A *solid* background is what makes Excalidraw hit-test the whole interior (a transparent fill only hits the outline),
// so click-and-drag anywhere on the card works. Opacity 0 keeps it invisible. Hit-testing does not look at opacity.
const NODE_HIT_BOX = Object.freeze({ strokeColor: "#94a3b8", backgroundColor: "#ffffff", fillStyle: "solid", opacity: 0, angle: 0 });
const EDGE_HIT_BOX = Object.freeze({ opacity: 0, strokeColor: "transparent", endArrowhead: null, startArrowhead: null });

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
    ...NODE_HIT_BOX,
    strokeWidth: 1,
    roughness: 0,
    customData: { [CUSTOM_KEY]: { role: "node", version: 1, meta } },
  };
}

export function readNode(element) {
  if (!isSystemDesignNode(element)) return null;
  const meta = sanitizeMeta(element.customData[CUSTOM_KEY].meta);
  if (!meta) return null;
  return { id: element.id, x: element.x, y: element.y, width: element.width, height: element.height, ...meta };
}

function arrowEndpoint(element, end) {
  const binding = end === "start" ? element.startBinding : element.endBinding;
  if (binding?.elementId) return { id: binding.elementId, bound: true };
  const points = Array.isArray(element.points) ? element.points : [];
  if (!points.length) return null;
  const point = points[end === "start" ? 0 : points.length - 1];
  return { x: Number(element.x || 0) + Number(point?.[0] || 0), y: Number(element.y || 0) + Number(point?.[1] || 0) };
}

function nodeAtArrowEndpoint(point, nodes, excludeId) {
  if (!point || point.id) return point?.id || null;
  const candidates = nodes.map((node) => {
    const x = Math.max(node.x, Math.min(point.x, node.x + node.width));
    const y = Math.max(node.y, Math.min(point.y, node.y + node.height));
    return { node, distance: Math.hypot(point.x - x, point.y - y) };
  }).filter(({ node, distance }) => node.id !== excludeId && distance <= 24)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.node.id || null;
}

export function readEdge(element, nodes = []) {
  // Accept legacy/native Excalidraw arrows only when their bindings or endpoints resolve to
  // System Design nodes. Ordinary canvas arrows remain outside the System Design graph.
  if (!element || element.isDeleted || element.type !== "arrow") return null;
  const data = element.customData?.[CUSTOM_KEY] || {};
  const isTaggedEdge = data.role === "edge";
  const start = arrowEndpoint(element, "start");
  const end = arrowEndpoint(element, "end");
  const from = start?.id || data.from || nodeAtArrowEndpoint(start, nodes);
  const to = end?.id || data.to || nodeAtArrowEndpoint(end, nodes, from);
  if (!from || !to || (!isTaggedEdge && !nodes.some((node) => node.id === from) || !nodes.some((node) => node.id === to))) return null;
  return {
    id: element.id,
    from,
    to,
    fromPort: data.fromPort || "right",
    toPort: data.toPort || "left",
    protocol: PROTOCOLS.includes(data.protocol) ? data.protocol : "HTTPS",
    lineStyle: data.lineStyle === "dashed" || element.strokeStyle === "dashed" ? "dashed" : "solid",
  };
}

/** Graph view of a scene. Edges whose endpoints were deleted are dropped. */
export function readGraph(elements) {
  const nodes = (elements || []).map(readNode).filter(Boolean);
  const ids = new Set(nodes.map((node) => node.id));
  const seenPairs = new Set();
  const edges = (elements || []).map((element) => readEdge(element, nodes)).filter((edge) => {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to)) return false;
    const pair = JSON.stringify([edge.from, edge.to]);
    if (seenPairs.has(pair)) return false;
    seenPairs.add(pair);
    return true;
  });
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
    strokeColor: "transparent",
    strokeWidth: 1,
    roughness: 0,
    ...EDGE_HIT_BOX,
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

const isSolid = (color) => Boolean(color) && color !== "transparent";

/**
 * Patches that bring elements written by older builds in line with the single-visual contract (invisible native
 * rectangles/arrows, rotated nodes) plus removal of connectors whose endpoint node is gone (a plain Delete key press
 * removes only the node, which would otherwise leave an invisible, still-clickable ghost connector).
 * Returns Map<elementId, patch>; empty when the scene is already clean, so applying it is idempotent.
 */
export function collectSceneRepairs(elements) {
  const repairs = new Map();
  const live = (elements || []).filter((element) => element && !element.isDeleted);
  const nodes = live.map(readNode).filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const seenPairs = new Set();
  for (const element of live) {
    if (isSystemDesignNode(element)) {
      const patch = {};
      if (element.opacity !== 0) patch.opacity = 0;
      if (!isSolid(element.backgroundColor) || element.fillStyle !== "solid") { patch.backgroundColor = "#ffffff"; patch.fillStyle = "solid"; }
      if (element.width < NODE_SIZE.width) patch.width = NODE_SIZE.width;
      if (element.height < NODE_SIZE.height) patch.height = NODE_SIZE.height;
      if (element.angle) patch.angle = 0; // A rotated hit-box would drift away from the unrotated card.
      if (Object.keys(patch).length) repairs.set(element.id, patch);
    } else if (element.type === "arrow") {
      const data = element.customData?.[CUSTOM_KEY] || {};
      const edge = readEdge(element, nodes);
      if (!edge || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        if (isSystemDesignEdge(element)) repairs.set(element.id, { isDeleted: true });
        continue;
      }
      const pair = JSON.stringify([edge.from, edge.to]);
      if (seenPairs.has(pair)) {
        repairs.set(element.id, { isDeleted: true });
        continue;
      }
      seenPairs.add(pair);
      const patch = {};
      const normalized = {
        role: "edge",
        version: 1,
        from: edge.from,
        to: edge.to,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
        protocol: edge.protocol,
        lineStyle: edge.lineStyle,
      };
      if (!isSystemDesignEdge(element)) {
        patch.customData = {
          ...element.customData,
          [CUSTOM_KEY]: { ...data, ...normalized },
        };
      } else if (data.from !== edge.from || data.to !== edge.to) {
        patch.customData = {
          ...element.customData,
          [CUSTOM_KEY]: { ...data, from: edge.from, to: edge.to },
        };
      }
      if (!isSystemDesignEdge(element)) {
        const from = nodes.find((node) => node.id === edge.from);
        const to = nodes.find((node) => node.id === edge.to);
        Object.assign(patch, arrowGeometry(from, edge.fromPort, to, edge.toPort).patch);
      }
      if (element.opacity !== 0) patch.opacity = 0;
      if (element.strokeColor !== "transparent") patch.strokeColor = "transparent";
      if (element.startArrowhead != null) patch.startArrowhead = null;
      if (element.endArrowhead != null) patch.endArrowhead = null;
      if (Object.keys(patch).length) repairs.set(element.id, patch);
    }
  }
  return repairs;
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
