const PRESERVED_PAINT = new Set(["none", "transparent", "inherit", "initial", "unset", "context-fill", "context-stroke"]);

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
  // Some catalog SVGs omit fill entirely and rely on SVG defaults (black fill).
  // Give those drawable nodes an explicit selected color without filling shapes
  // that are intentionally stroke-only or have fill="none".
  result = result.replace(/<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*)>/gi, (tag, name, attributes) => {
    const hasFill = /\bfill\s*=|\bfill\s*:/i.test(attributes);
    const hasStroke = /\bstroke\s*=|\bstroke\s*:/i.test(attributes);
    if (hasFill || hasStroke) return tag;
    return `<${name}${attributes} fill="${color}">`;
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
