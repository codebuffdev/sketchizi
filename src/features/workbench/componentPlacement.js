const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 96;
const DEFAULT_GAP = 28;

function overlaps(a, b, gap) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/** Find a predictable nearby placement without overlapping existing Workbench component containers. */
export function findComponentPlacement(center, elements = [], viewId = "system", options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const gap = options.gap ?? DEFAULT_GAP;
  const stepX = width + gap;
  const stepY = height + gap;
  const occupied = elements
    .filter((element) => !element?.isDeleted
      && element?.customData?.workbench?.role === "container"
      && (!viewId || element.customData.workbench.viewId === viewId))
    .map((element) => ({ x: element.x || 0, y: element.y || 0, width: element.width || width, height: element.height || height }));
  const origin = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  const candidates = [origin];
  // Search expanding rings in a stable order: right, below, left, above, then corners.
  for (let ring = 1; ring <= 40; ring += 1) {
    candidates.push(
      { ...origin, x: origin.x + ring * stepX },
      { ...origin, y: origin.y + ring * stepY },
      { ...origin, x: origin.x - ring * stepX },
      { ...origin, y: origin.y - ring * stepY },
      { ...origin, x: origin.x + ring * stepX, y: origin.y + ring * stepY },
      { ...origin, x: origin.x - ring * stepX, y: origin.y + ring * stepY },
      { ...origin, x: origin.x + ring * stepX, y: origin.y - ring * stepY },
      { ...origin, x: origin.x - ring * stepX, y: origin.y - ring * stepY },
    );
  }
  const available = candidates.find((candidate) => occupied.every((item) => !overlaps(candidate, item, gap)));
  const placement = available || candidates[candidates.length - 1];
  return { x: placement.x, y: placement.y, width, height };
}
