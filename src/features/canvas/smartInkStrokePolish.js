/**
 * Lightweight, local cleanup of individual freehand pen strokes.
 *
 * This improves ink immediately after the pen is lifted, without OCR, a
 * network request, or any guess about which character a stroke represents.
 * Text/glyph recognition remains a separate, optional capability.
 */
export function smoothInkPoints(points) {
  if (!Array.isArray(points) || points.length < 3) return points;
  return points.map((point, i) => {
    if (i === 0 || i === points.length - 1 || !Array.isArray(point)) return point;
    const previous = points[i - 1];
    const following = points[i + 1];
    if (!Array.isArray(previous) || !Array.isArray(following)) return point;
    const [px, py] = previous;
    const [x, y] = point;
    const [nx, ny] = following;
    if (![px, py, x, y, nx, ny].every(Number.isFinite)) return point;
    // Preserve real corners: do not round off crossings, dots, serifs or
    // deliberate angular changes just to make writing look smooth.
    const ax = x - px;
    const ay = y - py;
    const bx = nx - x;
    const by = ny - y;
    const aLength = Math.hypot(ax, ay);
    const bLength = Math.hypot(bx, by);
    if (aLength < 0.01 || bLength < 0.01) return point;
    const cosine = (ax * bx + ay * by) / (aLength * bLength);
    if (cosine < 0.65) return point;
    // Symmetric, low-strength filtering suppresses cursor jitter while
    // keeping endpoints and per-point pen pressure entirely unchanged.
    return [
      px * 0.18 + x * 0.64 + nx * 0.18,
      py * 0.18 + y * 0.64 + ny * 0.18,
      ...point.slice(2),
    ];
  });
}

export function polishFinishedInk(api, knownIds, captureUpdate) {
  const scene = api?.getSceneElements?.();
  if (!Array.isArray(scene) || !(knownIds instanceof Set)) return 0;
  const replacements = new Map();
  for (const element of scene) {
    if (element?.type !== "freedraw" || element.isDeleted || knownIds.has(element.id)) continue;
    knownIds.add(element.id);
    if (!Array.isArray(element.points) || element.points.length < 3) continue;
    const smoothed = smoothInkPoints(element.points);
    if (smoothed.every((point, index) => point === element.points[index])) continue;
    replacements.set(element.id, {
      ...element,
      points: smoothed,
      version: (Number.isFinite(element.version) ? element.version : 1) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      customData: { ...element.customData, sketchiziInkPolished: true },
    });
  }
  if (!replacements.size) return 0;
  api.updateScene?.({
    elements: scene.map((element) => replacements.get(element.id) || element),
    ...(captureUpdate ? { captureUpdate } : {}),
  });
  return replacements.size;
}
