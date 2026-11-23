// Layered left-to-right auto-layout for the system design graph. Pure.

import { getPrimitive } from "./primitives.js";
import { NODE_SIZE } from "./sceneModel.js";
import { snapToGrid } from "./orthogonalRouter.js";

export const LAYER_GAP = 120;
export const ROW_GAP = 48;

/** Returns Map<nodeId, {x, y}>. Entry nodes (or graph roots) form column 0; cycles are broken by first visit. */
export function computeAutoLayout(nodes, edges, { origin = { x: 0, y: 0 }, grid = 20 } = {}) {
  if (!nodes.length) return new Map();
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const roots = nodes.filter((n) => indeg.get(n.id) === 0);
  const starts = roots.length ? roots : [nodes.find((n) => getPrimitive(n.kind)?.entry) || nodes[0]];

  // Longest-path layering via BFS relaxation, capped by node count to survive cycles.
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const queue = starts.map((n) => n.id);
  const visits = new Map();
  while (queue.length) {
    const id = queue.shift();
    const count = (visits.get(id) || 0) + 1;
    visits.set(id, count);
    if (count > nodes.length) continue;
    for (const next of out.get(id)) {
      if (layer.get(next) < layer.get(id) + 1) {
        layer.set(next, layer.get(id) + 1);
        queue.push(next);
      }
    }
  }
  // Any unreachable node stays at layer 0 but is placed after its column-mates.
  const columns = new Map();
  for (const n of nodes) {
    const l = layer.get(n.id);
    if (!columns.has(l)) columns.set(l, []);
    columns.get(l).push(n);
  }
  const positions = new Map();
  const maxRows = Math.max(...[...columns.values()].map((c) => c.length));
  const totalHeight = maxRows * NODE_SIZE.height + (maxRows - 1) * ROW_GAP;
  for (const [l, column] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const colHeight = column.length * NODE_SIZE.height + (column.length - 1) * ROW_GAP;
    const top = origin.y + (totalHeight - colHeight) / 2;
    column.forEach((n, row) => {
      positions.set(n.id, {
        x: snapToGrid(origin.x + l * (NODE_SIZE.width + LAYER_GAP), grid),
        y: snapToGrid(top + row * (NODE_SIZE.height + ROW_GAP), grid),
      });
    });
  }
  return positions;
}
