// Smart placement for nodes added from the dock. Pure scene-coordinate math (no React, no Excalidraw).

import { NODE_SIZE } from "./sceneModel.js";
import { snapToGrid } from "./orthogonalRouter.js";

/**
 * Clear horizontal space between the selected node's right edge and the new node's left edge.
 * It has to exceed 2x the connector stub (2 x 24px) or the router cannot draw a facing elbow and wraps the line around
 * both cards. 220 leaves room for the elbow plus the protocol badge sitting on the connector.
 */
export const PLACEMENT_GAP_X = 220;
export const PLACEMENT_ROW_GAP = 48;
export const COLLISION_PAD = 24;

const intersects = (a, b, pad) =>
  a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;

const isFree = (nodes, rect, pad) => !nodes.some((node) => intersects(rect, node, pad));

/**
 * Where to put a new node.
 * - With a selected node: directly to its right (`PLACEMENT_GAP_X` clear). If that slot is taken (a sibling is already
 *   there) the node stacks into the same column, alternating below / above, so fan-outs read as a tidy column.
 * - Without a selection: around the viewport centre, scanning outward ring by ring so nothing lands on top of another node.
 * Returns the top-left scene position (grid-snapped when `grid` > 0) and whether it is anchored to the selected node.
 */
export function planPlacement({ nodes = [], selectedNode = null, center = { x: 0, y: 0 }, grid = 0, size = NODE_SIZE, pad = COLLISION_PAD } = {}) {
  const snap = (value) => snapToGrid(value, grid);
  const rectAt = (x, y) => ({ x: snap(x), y: snap(y), width: size.width, height: size.height });

  if (selectedNode) {
    const baseX = selectedNode.x + selectedNode.width + PLACEMENT_GAP_X;
    const baseY = selectedNode.y + (selectedNode.height - size.height) / 2;
    const step = size.height + PLACEMENT_ROW_GAP;
    for (let i = 0; i < 40; i += 1) {
      // 0, +1, -1, +2, -2 ... : first free slot wins.
      const row = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -(i / 2);
      const rect = rectAt(baseX, baseY + row * step);
      if (isFree(nodes, rect, pad)) return { position: { x: rect.x, y: rect.y }, anchored: true };
    }
    const fallback = rectAt(baseX, baseY + 21 * step);
    return { position: { x: fallback.x, y: fallback.y }, anchored: true };
  }

  const baseX = center.x - size.width / 2;
  const baseY = center.y - size.height / 2;
  const cellX = size.width + 40;
  const cellY = size.height + PLACEMENT_ROW_GAP;
  for (let ring = 0; ring < 12; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const rect = rectAt(baseX + dx * cellX, baseY + dy * cellY);
        if (isFree(nodes, rect, pad)) return { position: { x: rect.x, y: rect.y }, anchored: false };
      }
    }
  }
  const fallback = rectAt(baseX, baseY);
  return { position: { x: fallback.x, y: fallback.y }, anchored: false };
}

/**
 * Is a scene rect fully inside the visible canvas once floating chrome is accounted for?
 * `view` = { scrollX, scrollY, zoom, width, height } as in Excalidraw's appState (screen = (scene + scroll) * zoom).
 * `insets` reserve room for the top pill, the bottom dock and the right header rail so a node is never "visible" but hidden under them.
 */
export function isRectInView(rect, view, insets = { top: 96, right: 96, bottom: 112, left: 24 }) {
  const { scrollX = 0, scrollY = 0, zoom = 1, width = 1200, height = 800 } = view || {};
  const left = (rect.x + scrollX) * zoom;
  const top = (rect.y + scrollY) * zoom;
  const right = (rect.x + rect.width + scrollX) * zoom;
  const bottom = (rect.y + rect.height + scrollY) * zoom;
  return left >= insets.left && top >= insets.top && right <= width - insets.right && bottom <= height - insets.bottom;
}

/**
 * Scroll that brings `rect` to the middle of the free area (between the insets), keeping the zoom.
 * Returns the next { scrollX, scrollY } in Excalidraw's convention.
 */
export function scrollToReveal(rect, view, insets = { top: 96, right: 96, bottom: 112, left: 24 }) {
  const { zoom = 1, width = 1200, height = 800 } = view || {};
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const freeCenterX = (insets.left + (width - insets.right)) / 2;
  const freeCenterY = (insets.top + (height - insets.bottom)) / 2;
  return { scrollX: freeCenterX / zoom - cx, scrollY: freeCenterY / zoom - cy };
}
