/**
 * Geometry shared by the DOM editor and the canvas renderer, so a card looks
 * identical while it is being typed and after it is committed.
 *
 * Scene layout (top -> bottom):
 *   header row (filename + language badge)   HEADER_HEIGHT
 *   gap                                       HEADER_GAP   (6px)
 *   rounded card                              cardHeight
 */

export const CODE_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";

export const CODE_METRICS = Object.freeze({
  fontSize: 14,
  lineHeight: 21,
  paddingX: 18,
  paddingY: 16,
  radius: 14,
  minWidth: 280,
  minHeight: 160,
  headerHeight: 22,
  headerGap: 6,
  tabSize: 2,
  headerFontSize: 12.5,
  badgeFontSize: 10,
});

// 0.6em is the advance of virtually every monospace face; used until a real measurement exists.
const FALLBACK_CHAR_WIDTH = CODE_METRICS.fontSize * 0.6;
let cachedCharWidth = null;

/** Measured advance of one monospace column at the code font size (cached). */
export function getCodeCharWidth() {
  if (cachedCharWidth) return cachedCharWidth;
  try {
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(8, 8)
      : (typeof document !== "undefined" ? document.createElement("canvas") : null);
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.font = `${CODE_METRICS.fontSize}px ${CODE_FONT_FAMILY}`;
      const width = ctx.measureText("M".repeat(100)).width / 100;
      if (Number.isFinite(width) && width > 2) { cachedCharWidth = width; return width; }
    }
  } catch { /* fall through */ }
  return FALLBACK_CHAR_WIDTH;
}

/** Expand tabs to the next tab stop so columns line up. */
export function expandTabs(line, tabSize = CODE_METRICS.tabSize) {
  if (!line.includes("\t")) return line;
  let out = "";
  for (const ch of line) {
    if (ch === "\t") out += " ".repeat(tabSize - (out.length % tabSize));
    else out += ch;
  }
  return out;
}

/**
 * Card + element size for a snippet. Width and height only ever grow with content.
 * `minWidth` / `minHeight` (total block size, natural units) are an optional floor,
 * used to keep a block the user has resized from collapsing back to its content size.
 */
export function measureCodeBlock(code, { charWidth = getCodeCharWidth(), minWidth: floorWidth = 0, minHeight: floorHeight = 0 } = {}) {
  const lines = String(code ?? "").replace(/\r\n?/g, "\n").split("\n");
  const columns = lines.reduce((max, line) => Math.max(max, expandTabs(line).length), 0);
  const { paddingX, paddingY, lineHeight, minWidth, minHeight, headerHeight, headerGap } = CODE_METRICS;
  // One spare column keeps the caret from being clipped at the end of the longest line.
  const textWidth = Math.ceil((columns + (columns ? 1 : 0)) * charWidth);
  const cardWidth = Math.max(minWidth, textWidth + paddingX * 2, Math.ceil(floorWidth) || 0);
  const cardHeight = Math.max(minHeight, lines.length * lineHeight + paddingY * 2, (Math.ceil(floorHeight) || 0) - headerHeight - headerGap);
  return {
    lines,
    columns,
    charWidth,
    cardWidth,
    cardHeight,
    cardTop: headerHeight + headerGap,
    width: cardWidth,
    height: headerHeight + headerGap + cardHeight,
  };
}

/**
 * How a block sits on the canvas relative to its natural (unscaled) layout.
 * Corner-resizing an image element scales it uniformly, so `scale` is the
 * element width over the natural width it was last rendered at (`data.box`,
 * or the content measurement for blocks saved before `box` existed). `box` is
 * the natural-size floor the editor and re-render must not shrink below.
 */
export function getCodeBlockGeometry(element, data) {
  const base = data?.box?.width > 0 && data?.box?.height > 0 ? data.box : measureCodeBlock(data?.code);
  const elementWidth = Number(element?.width);
  const scale = Number.isFinite(elementWidth) && elementWidth > 0 && base.width > 0 ? elementWidth / base.width : 1;
  const elementHeight = Number(element?.height);
  const height = Number.isFinite(elementHeight) && elementHeight > 0 ? elementHeight / scale : base.height;
  return { scale, box: { width: base.width, height: Math.max(base.height, height) } };
}
