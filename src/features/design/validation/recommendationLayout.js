const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;
const DEFAULT_GAP = 32;
const PADDING = 24;

function boundsOf(element) {
  const x = Number(element?.x || 0);
  const y = Number(element?.y || 0);
  const width = Math.max(0, Number(element?.width || 0));
  const height = Math.max(0, Number(element?.height || 0));
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function intersects(a, b) {
  return a.x < b.right + PADDING && a.right + PADDING > b.x
    && a.y < b.bottom + PADDING && a.bottom + PADDING > b.y;
}

/**
 * Pick a predictable free location to the right of the diagram, searching
 * downward in rows if the preferred slot overlaps existing visible elements.
 * This helper is read-only and can be tested without the canvas runtime.
 */
export function findRecommendationPosition(elements = [], {
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  gap = DEFAULT_GAP,
} = {}) {
  const visible = elements.filter((element) => element && !element.isDeleted
    && ["rectangle", "ellipse", "diamond", "polygon", "image", "frame", "text", "arrow", "line"].includes(element.type))
    .map(boundsOf);
  if (!visible.length) return { x: 80, y: 80, width, height };

  const left = Math.min(...visible.map((item) => item.x));
  const right = Math.max(...visible.map((item) => item.right));
  const top = Math.min(...visible.map((item) => item.y));
  const bottom = Math.max(...visible.map((item) => item.bottom));
  const candidateX = Math.max(80, right + gap);
  const candidateY = Math.max(80, top);
  const maxRows = Math.max(12, visible.length * 3);
  for (let row = 0; row < maxRows; row += 1) {
    const candidate = {
      x: candidateX,
      y: candidateY + row * (height + gap),
      width,
      height,
      right: candidateX + width,
      bottom: candidateY + row * (height + gap) + height,
    };
    if (!visible.some((item) => intersects(candidate, item))) {
      return { x: candidate.x, y: candidate.y, width, height };
    }
  }

  // If a long, wide diagram occupies all rows to the right, append beneath it.
  return { x: Math.max(80, left), y: bottom + gap, width, height };
}
