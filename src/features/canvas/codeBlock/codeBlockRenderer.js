import { badgeForFilename, effectiveFilename, languageForFilename } from "./codeLanguages.js";
import { CODE_FONT_FAMILY, CODE_METRICS, expandTabs, measureCodeBlock } from "./codeBlockLayout.js";
import { CODE_BORDER_WIDTH, getCodeTheme, isItalicToken, normalizeCodeTheme } from "./codeSyntaxTheme.js";
import { tokenizeCode } from "./codeTokenizer.js";

const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 8192;

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * Paint one code card (header + rounded card + highlighted code) at the origin
 * of `ctx`, in scene units. The caller owns canvas size / scale / clearing.
 */
export function drawCodeBlock(ctx, { code, filename, theme }, layout = measureCodeBlock(code)) {
  const palette = getCodeTheme(theme);
  const m = CODE_METRICS;
  const name = effectiveFilename(filename);
  const badge = badgeForFilename(name);
  const { cardWidth, cardHeight, cardTop, charWidth } = layout;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // ---- header row: filename + language badge (above the card's top-left corner)
  ctx.font = `600 ${m.headerFontSize}px ${CODE_FONT_FAMILY}`;
  ctx.fillStyle = palette.headerText;
  let badgeWidth = 0;
  if (badge) {
    ctx.font = `700 ${m.badgeFontSize}px ${CODE_FONT_FAMILY}`;
    badgeWidth = Math.ceil(ctx.measureText(badge).width) + 12;
  }
  const nameMax = Math.max(40, cardWidth - 4 - (badge ? badgeWidth + 8 : 0));
  ctx.font = `600 ${m.headerFontSize}px ${CODE_FONT_FAMILY}`;
  ctx.fillStyle = palette.headerText;
  const shownName = fitText(ctx, name, nameMax);
  ctx.fillText(shownName, 4, m.headerHeight / 2);
  if (badge) {
    const badgeX = 4 + Math.ceil(ctx.measureText(shownName).width) + 8;
    const badgeH = 16;
    const badgeY = (m.headerHeight - badgeH) / 2;
    roundedRectPath(ctx, badgeX + 0.5, badgeY + 0.5, badgeWidth - 1, badgeH - 1, 5);
    ctx.fillStyle = palette.badgeFill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.badgeBorder;
    ctx.stroke();
    ctx.font = `700 ${m.badgeFontSize}px ${CODE_FONT_FAMILY}`;
    ctx.fillStyle = palette.badgeText;
    ctx.textAlign = "center";
    ctx.fillText(badge, badgeX + badgeWidth / 2, m.headerHeight / 2 + 0.5);
    ctx.textAlign = "left";
  }

  // ---- rounded card: surface + crisp 1.5px border (stroked inside the box)
  const inset = CODE_BORDER_WIDTH / 2;
  roundedRectPath(ctx, inset, cardTop + inset, cardWidth - CODE_BORDER_WIDTH, cardHeight - CODE_BORDER_WIDTH, m.radius);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.lineWidth = CODE_BORDER_WIDTH;
  ctx.strokeStyle = palette.border;
  ctx.stroke();

  // ---- tokenized code
  const language = languageForFilename(name);
  // Tabs are whitespace to the tokenizer, so expand them first and keep columns aligned.
  const expanded = String(code ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => expandTabs(line, m.tabSize)).join("\n");
  const tokenLines = tokenizeCode(expanded, language);
  ctx.save();
  roundedRectPath(ctx, inset, cardTop + inset, cardWidth - CODE_BORDER_WIDTH, cardHeight - CODE_BORDER_WIDTH, m.radius);
  ctx.clip();
  tokenLines.forEach((tokens, row) => {
    const y = cardTop + m.paddingY + row * m.lineHeight + m.lineHeight / 2;
    let column = 0;
    for (const token of tokens) {
      if (token.text.trim()) {
        ctx.font = `${isItalicToken(token.type) ? "italic " : ""}${m.fontSize}px ${CODE_FONT_FAMILY}`;
        ctx.fillStyle = palette.tokens[token.type] || palette.tokens.plain;
        ctx.fillText(token.text, m.paddingX + column * charWidth, y);
      }
      column += token.text.length;
    }
  });
  ctx.restore();
}

/** Pixel scale for the bitmap: crisp at 2x zoom on any display, bounded in memory. */
export function pickRenderScale(width, height, dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1) {
  const wanted = Math.min(4, Math.max(2, Math.ceil(dpr) * 2));
  const areaCap = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
  const sideCap = MAX_SIDE / Math.max(width, height);
  return Math.max(1, Math.min(wanted, areaCap, sideCap));
}

/**
 * Rasterise a snippet to a PNG data URL (DPR-scaled). PNG, not SVG: Excalidraw
 * colour-inverts SVG images in its dark theme, which would scramble the palette.
 */
export function renderCodeBlockImage({ code, filename, theme, box }, { dpr } = {}) {
  const layout = measureCodeBlock(code, { minWidth: box?.width, minHeight: box?.height });
  const scale = pickRenderScale(layout.width, layout.height, dpr);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawCodeBlock(ctx, { code, filename, theme: normalizeCodeTheme(theme) }, layout);
  return { dataURL: canvas.toDataURL("image/png"), width: layout.width, height: layout.height, scale };
}
