export const CSS_PX_PER_INCH = 96;
export const CM_PER_INCH = 2.54;
export const PX_PER_CM = CSS_PX_PER_INCH / CM_PER_INCH;

export function pxToCm(px) {
  const numericPx = Number(px);
  if (!Number.isFinite(numericPx) || numericPx <= 0) return 0;
  return (numericPx * CM_PER_INCH) / CSS_PX_PER_INCH;
}

export function formatLengthCm(cm) {
  const numericCm = Number(cm);
  const safeCm = Number.isFinite(numericCm) && numericCm > 0 ? numericCm : 0;
  return `${safeCm.toFixed(2)} cm`;
}

export function isLinearElementType(type) {
  return type === "line" || type === "arrow";
}

export function computeLinearElementLengthPx(element) {
  if (!element) return 0;
  const points = Array.isArray(element.points) ? element.points : null;
  if (points && points.length >= 2) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const dx = (Number(curr?.[0]) || 0) - (Number(prev?.[0]) || 0);
      const dy = (Number(curr?.[1]) || 0) - (Number(prev?.[1]) || 0);
      total += Math.hypot(dx, dy);
    }
    return total;
  }
  return Math.hypot(Number(element.width) || 0, Number(element.height) || 0);
}

export function computeElementBounds(element) {
  const x = Number(element?.x) || 0;
  const y = Number(element?.y) || 0;
  const width = Number(element?.width) || 0;
  const height = Number(element?.height) || 0;

  if (
    isLinearElementType(element?.type) &&
    Array.isArray(element?.points) &&
    element.points.length >= 1
  ) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of element.points) {
      const px = x + (Number(pt?.[0]) || 0);
      const py = y + (Number(pt?.[1]) || 0);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const angle = Number(element?.angle) || 0;
    if (angle !== 0) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      minX = Infinity;
      maxX = -Infinity;
      minY = Infinity;
      maxY = -Infinity;
      for (const pt of element.points) {
        const px = x + (Number(pt?.[0]) || 0) - cx;
        const py = y + (Number(pt?.[1]) || 0) - cy;
        const rx = cx + px * cos - py * sin;
        const ry = cy + px * sin + py * cos;
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
      }
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      bottomCenterX: (minX + maxX) / 2,
      bottomY: maxY,
    };
  }

  const minX = Math.min(x, x + width);
  const maxX = Math.max(x, x + width);
  const minY = Math.min(y, y + height);
  const maxY = Math.max(y, y + height);

  return {
    minX,
    maxX,
    minY,
    maxY,
    bottomCenterX: (minX + maxX) / 2,
    bottomY: maxY,
  };
}

export function getElementMeasurement(element) {
  const width = Math.round(Math.abs(Number(element?.width) || 0));
  const height = Math.round(Math.abs(Number(element?.height) || 0));
  const fontSize = Math.round(Number(element?.fontSize) || 20);

  if (element?.type === "text") {
    return {
      kind: "text",
      isText: true,
      isLinear: false,
      fontSize,
      width,
      height,
      lengthPx: null,
      lengthCm: null,
      label: `${fontSize}px`,
      title: `Font size: ${fontSize}px (${width} × ${height} px)`,
    };
  }

  if (isLinearElementType(element?.type)) {
    const rawLengthPx = computeLinearElementLengthPx(element);
    const lengthCmValue = pxToCm(rawLengthPx);
    const label = formatLengthCm(lengthCmValue);
    const roundedPx = Math.round(rawLengthPx);
    const kindLabel = element.type === "arrow" ? "Arrow length" : "Line length";
    return {
      kind: "linear",
      isText: false,
      isLinear: true,
      fontSize,
      width,
      height,
      lengthPx: roundedPx,
      lengthCm: Number(lengthCmValue.toFixed(2)),
      label,
      title: `${kindLabel}: ${label} (${roundedPx} px)`,
    };
  }

  return {
    kind: "dimensions",
    isText: false,
    isLinear: false,
    fontSize,
    width,
    height,
    lengthPx: null,
    lengthCm: null,
    label: `${width} × ${height} px`,
    title: `Dimensions: ${width} × ${height} px`,
  };
}
