export const BASE_NODE_WIDTH = 204;
export const BASE_NODE_HEIGHT = 88;

/** Scale card contents against the original design size without unbounded growth. */
export function getNodeContentScale(width, height) {
  const safeWidth = Number.isFinite(Number(width)) ? Number(width) : BASE_NODE_WIDTH;
  const safeHeight = Number.isFinite(Number(height)) ? Number(height) : BASE_NODE_HEIGHT;
  return Math.max(0.85, Math.min(safeWidth / BASE_NODE_WIDTH, safeHeight / BASE_NODE_HEIGHT, 2.75));
}
