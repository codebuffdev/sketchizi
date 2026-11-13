const PRESERVED_PAINT = new Set(["none", "transparent", "inherit", "initial", "unset", "context-fill", "context-stroke"]);

export const CORE_ICON_COLORS = [
  ["#1e293b", "Ink"],
  ["#ffffff", "White"],
  ["#7c3aed", "Violet"],
  ["#3b82f6", "Blue"],
  ["#16a34a", "Green"],
  ["#d97706", "Amber"],
  ["#dc2626", "Red"],
];

export function isLightColor(color) {
  if (typeof color !== "string") return false;
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return false;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex.split("").map((ch) => ch + ch).join("");
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 185;
}

function recolorPaint(value, color) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || PRESERVED_PAINT.has(normalized) || normalized.startsWith("url(")) return value;
  return color;
}

function recolorDeclarations(source, color) {
  return source.replace(/(fill|stroke|color|stop-color)\s*:\s*([^;}{]+)/gi, (match, property, value) => {
    return `${property}:${recolorPaint(value, color)}`;
  });
}

export function recolorSvgMarkup(svg, color) {
  if (typeof svg !== "string" || !/<svg\b/i.test(svg) || !/^#[0-9a-f]{3,8}$/i.test(color || "")) return null;
  let result = svg.replace(/\b(fill|stroke|color|stop-color)\s*=\s*(["\x27])(.*?)\2/gi, (match, property, quote, value) => {
    return `${property}=${quote}${recolorPaint(value, color)}${quote}`;
  });
  result = recolorDeclarations(result, color);
  // Some catalog SVGs (like Simple Icons) omit fill on the root <svg> and rely
  // on SVG's default black fill, while outlined icons (like Lucide) set
  // fill="none" stroke="currentColor" on <svg>. Set fill on root <svg> only
  // when neither fill nor stroke is declared on <svg>, so child paths inherit
  // cleanly without filling in stroke-only icons.
  result = result.replace(/<svg\b([^>]*)>/i, (tag, attributes) => {
    const hasFill = /\bfill\s*=|\bfill\s*:/i.test(attributes);
    const hasStroke = /\bstroke\s*=|\bstroke\s*:/i.test(attributes);
    if (hasFill || hasStroke) return tag;
    return `<svg${attributes} fill="${color}">`;
  });
  return result;
}

export function recolorSvgDataUrl(dataURL, color) {
  if (typeof dataURL !== "string" || !dataURL.startsWith("data:image/svg+xml")) return null;
  try {
    const comma = dataURL.indexOf(",");
    if (comma < 0) return null;
    const metadata = dataURL.slice(0, comma);
    const payload = dataURL.slice(comma + 1);
    const svg = metadata.includes(";base64") ? decodeURIComponent(escape(atob(payload))) : decodeURIComponent(payload);
    const recolored = recolorSvgMarkup(svg, color);
    if (!recolored) return null;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(recolored)))}`;
  } catch { return null; }
}

export function isRecolorableEssentialIcon(element) {
  if (element?.type !== "image" || !(element.customData?.iconId || element.customData?.diagramIcon)) return false;
  const customData = element.customData || {};
  const source = String(customData.iconSource || "").toLowerCase();
  const category = String(customData.iconCategory || "").toLowerCase();
  return source === "eraser" || category === "essentials" || category === "eraser icons";
}
