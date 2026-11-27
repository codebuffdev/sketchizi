// Browser-side helpers for drawing and exporting multi-color text. The layout
// itself is pure (textRuns.js); this file only supplies canvas measurement and
// painting.

import { expandRunsForExport, fontStringFor, getElementRuns, hasColoredSegments, layoutRuns } from "./textRuns.js";

let sharedContext = null;
const context = () => {
  if (!sharedContext) sharedContext = document.createElement("canvas").getContext("2d");
  return sharedContext;
};

// ctx.measureText(...).width for the element's font, so segment x advances match
// what the browser (and the live editor) lays out.
export function measureFor(element) {
  const ctx = context();
  ctx.font = fontStringFor(element);
  return (text) => ctx.measureText(text).width;
}

// First-baseline offset inside a line box. Excalidraw's fonts use a line height
// equal to ascent + descent, so centering the content area in the line box lands
// on the same baseline Excalidraw uses.
function baselineOffset(ctx, element, lineHeight) {
  const metrics = ctx.measureText("Hg");
  const fontSize = Number(element.fontSize) || 20;
  const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
  return ascent + (lineHeight - ascent - descent) / 2;
}

export const hasRichTextRuns = (elements) =>
  elements.some((element) => element?.type === "text" && !element.isDeleted && getElementRuns(element).length > 0);

// Strict branch: an element with runs is painted here from its runs only (segment by
// segment, one fillText each, never element.text / strokeColor); elements without runs are
// left to Excalidraw's single text pass. Paint only the segments whose color differs from the base color; the base-colored
// text underneath is Excalidraw's own render. `scale` is zoom (for hairline width).
// `origin` ({ x, y } in device px) is the scene->pixel translation of ctx, used to snap
// unrotated text origins to whole device pixels for native-sharp anti-aliasing.
export function paintRichTextRuns(ctx, elements, { skipId = null, scale = 1, origin = null } = {}) {
  for (const element of elements) {
    if (element.type !== "text" || element.isDeleted || element.id === skipId || !getElementRuns(element).length) continue;
    const layout = layoutRuns(element, measureFor(element));
    if (!hasColoredSegments(layout)) continue;
    ctx.save();
    ctx.globalAlpha = (Number(element.opacity) || 100) / 100;
    ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
    if (element.angle) ctx.rotate(element.angle);
    ctx.translate(-element.width / 2, -element.height / 2);
    ctx.font = fontStringFor(element);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const baseline = baselineOffset(ctx, element, layout.lineHeight);
    for (const line of layout.lines) {
      for (const segment of line.segments) {
        if (!segment.color || !segment.text.trim()) continue;
        ctx.fillStyle = segment.color;
        // One fillText per segment: no strokeText outline pass.
        let tx = line.offsetX + segment.x;
        let ty = line.y + baseline;
        if (origin && !element.angle && scale > 0) {
          const devX = (element.x + tx) * scale + origin.x;
          const devY = (element.y + ty) * scale + origin.y;
          tx = (Math.round(devX) - origin.x) / scale - element.x;
          ty = (Math.round(devY) - origin.y) / scale - element.y;
        }
        ctx.fillText(segment.text, tx, ty);
      }
    }
    ctx.restore();
  }
}

// Export parity: swap multi-color text for per-segment native text elements so
// Excalidraw's SVG / PNG exporters render them.
export function expandRichTextRuns(elements) {
  if (!hasRichTextRuns(elements)) return elements;
  return expandRunsForExport(elements, measureFor);
}
