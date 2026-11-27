// Auto-expanding shape containers: pure planning logic (no DOM, no Excalidraw
// imports) so it is unit-tested with `node --test`.
//
// A "container" is a rectangle / ellipse / diamond that owns a bound text
// element (text.containerId === container.id, container.boundElements has
// { type: "text" }). When that text changes, the container is resized so the
// text keeps a comfortable inner margin and never overflows the border.

import { absolutePointsToPatch, getAbsolutePoints, normalizeOrthogonalPath } from "../arrowRouting.js";

export const PADDING_X = 16;
export const PADDING_Y = 12;
export const FIT_SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

// A rectangle's text box can use the whole shape. Text must sit inside the
// inscribed rectangle of an ellipse (1/sqrt2 of the box) or diamond (1/2).
const INSCRIBE_FACTOR = { rectangle: 1, ellipse: Math.SQRT2, diamond: 2 };

const EPSILON = 0.5;
const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < EPSILON;
const bumpFields = (element) => ({
  version: (Number(element.version) || 0) + 1,
  versionNonce: Math.floor(Math.random() * 2147483647),
  updated: Date.now(),
});

export function getBoundTextElement(container, elementsById) {
  for (const bound of container?.boundElements || []) {
    if (String(bound?.type || "").toLowerCase() !== "text") continue;
    const text = elementsById.get(bound.id);
    if (text && !text.isDeleted && text.type === "text" && text.containerId === container.id) return text;
  }
  return null;
}

/** Container id for a selected / edited element, or null when it has none. */
export function getContainerIdOf(element, elementsById) {
  if (!element || element.isDeleted) return null;
  if (element.type === "text") {
    const container = element.containerId ? elementsById.get(element.containerId) : null;
    return container && FIT_SHAPE_TYPES.has(container.type) ? container.id : null;
  }
  if (!FIT_SHAPE_TYPES.has(element.type)) return null;
  return getBoundTextElement(element, elementsById) ? element.id : null;
}

/** Everything that can change the text's measured size, in one comparable string. */
export function getTextSignature(textElement, liveText) {
  const text = liveText ?? textElement.originalText ?? textElement.text ?? "";
  return [text, textElement.fontSize, textElement.fontFamily, textElement.lineHeight].join("\u0001");
}

/**
 * New container box (and centred text position) for a measured text block.
 *
 *   requiredWidth  = max(minWidth,  (textWidth  + 2 * paddingX) * inscribeFactor)
 *   requiredHeight = max(minHeight, (textHeight + 2 * paddingY) * inscribeFactor)
 *
 * Anchor (works for growing AND shrinking):
 *   left-aligned   -> top-left fixed, grows right / down
 *   right-aligned  -> top-right fixed, grows left / down
 *   center-aligned -> centre fixed, grows symmetrically
 *   rotated shapes -> centre fixed, so the text stays on the rotated axis
 */
export function computeContainerFit({
  container, textWidth, textHeight, textAlign = "center", minWidth, minHeight,
  paddingX = PADDING_X, paddingY = PADDING_Y,
}) {
  const factor = INSCRIBE_FACTOR[container.type] ?? 1;
  const width = Math.ceil(Math.max(minWidth, (textWidth + paddingX * 2) * factor));
  const height = Math.ceil(Math.max(minHeight, (textHeight + paddingY * 2) * factor));
  const rotated = Math.abs(Number(container.angle) || 0) > 1e-6;
  const anchorX = rotated || textAlign === "center" ? 0.5 : textAlign === "right" ? 1 : 0;
  const anchorY = rotated || textAlign === "center" ? 0.5 : 0;
  const x = container.x - (width - container.width) * anchorX;
  const y = container.y - (height - container.height) * anchorY;
  return {
    x, y, width, height,
    textX: x + (width - textWidth) / 2,
    textY: y + (height - textHeight) / 2,
  };
}

/**
 * Moves a point that sits on the old container's border to the matching spot on
 * the new border. Scaling the bounding box maps a rectangle, ellipse or diamond
 * outline onto the resized outline, so attachment points (and `focus`) stay put.
 */
export function remapAttachedPoint(point, oldBox, newBox, angle = 0) {
  const oldCx = oldBox.x + oldBox.width / 2;
  const oldCy = oldBox.y + oldBox.height / 2;
  const newCx = newBox.x + newBox.width / 2;
  const newCy = newBox.y + newBox.height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - oldCx;
  const dy = point.y - oldCy;
  const localX = dx * cos + dy * sin; // un-rotate
  const localY = -dx * sin + dy * cos;
  const scaledX = oldBox.width ? localX * (newBox.width / oldBox.width) : localX;
  const scaledY = oldBox.height ? localY * (newBox.height / oldBox.height) : localY;
  return {
    x: newCx + scaledX * cos - scaledY * sin, // re-rotate
    y: newCy + scaledX * sin + scaledY * cos,
  };
}

/**
 * Plans element patches for the given candidate containers.
 *
 * @param {object} options
 * @param {object[]} options.elements              non-deleted scene elements
 * @param {Iterable<string>} options.containerIds  containers whose text changed
 * @param {(args:{text:string,fontSize:number,fontFamily:number,lineHeight:number})=>{width:number,height:number}} options.measure
 * @param {Map<string,string>} [options.liveTextById] live editor text, by text element id
 * @param {string|null} [options.editingTextId]      text element currently being edited
 * @returns {Map<string, object>} elementId -> patch (version fields already bumped)
 */
export function planContainerExpansion({ elements, containerIds, measure, liveTextById = new Map(), editingTextId = null }) {
  const byId = new Map(elements.filter((el) => el && !el.isDeleted).map((el) => [el.id, el]));
  const patches = new Map();
  const resized = [];

  for (const id of containerIds) {
    const container = byId.get(id);
    if (!container || container.locked || !FIT_SHAPE_TYPES.has(container.type)) continue;
    const textElement = getBoundTextElement(container, byId);
    if (!textElement) continue;

    const sourceText = liveTextById.get(textElement.id) ?? textElement.originalText ?? textElement.text ?? "";
    const lineHeight = Number(textElement.lineHeight) || 1.25;
    const measured = sourceText.length
      ? measure({ text: sourceText, fontSize: textElement.fontSize, fontFamily: textElement.fontFamily, lineHeight })
      : { width: 0, height: 0 };

    // The floor is the size the user gave the shape: its size before any
    // auto-growth, or whatever it is now if it was resized by hand since.
    const record = container.customData?.autoFit;
    const manuallyResized = !record || !near(container.width, record.appliedWidth) || !near(container.height, record.appliedHeight);
    const minWidth = manuallyResized ? container.width : record.minWidth;
    const minHeight = manuallyResized ? container.height : record.minHeight;

    const fit = computeContainerFit({
      container, textWidth: measured.width, textHeight: measured.height,
      textAlign: textElement.textAlign, minWidth, minHeight,
    });

    const nextRecord = { minWidth, minHeight, appliedWidth: fit.width, appliedHeight: fit.height };
    const recordChanged = !record || record.minWidth !== minWidth || record.minHeight !== minHeight
      || record.appliedWidth !== fit.width || record.appliedHeight !== fit.height;
    const boxChanged = !near(container.x, fit.x) || !near(container.y, fit.y)
      || !near(container.width, fit.width) || !near(container.height, fit.height);
    if (boxChanged || recordChanged) {
      patches.set(container.id, {
        ...bumpFields(container),
        x: fit.x, y: fit.y, width: fit.width, height: fit.height,
        customData: { ...(container.customData || {}), autoFit: nextRecord },
      });
    }
    if (boxChanged) resized.push({ container, box: fit });

    // Re-centre the text. While it is being edited Excalidraw owns its string, so
    // only geometry is touched; afterwards stale wrap breaks are dropped, since the
    // container is now wide enough for every line.
    if (measured.width > 0) {
      const textPatch = {
        x: fit.textX, y: fit.textY, width: measured.width, height: measured.height,
        angle: container.angle || 0,
      };
      const original = textElement.originalText ?? textElement.text;
      if (editingTextId !== textElement.id && original !== textElement.text) textPatch.text = original;
      const textChanged = Object.entries(textPatch).some(([key, value]) => (typeof value === "number" ? !near(textElement[key], value) : textElement[key] !== value));
      if (textChanged) patches.set(textElement.id, { ...bumpFields(textElement), ...textPatch });
    }
  }

  planArrowUpdates({ byId, resized, patches });
  return patches;
}

/** Re-attaches arrow endpoints bound to a resized container onto its new border. */
function planArrowUpdates({ byId, resized, patches }) {
  if (!resized.length) return;
  const boxes = new Map(resized.map(({ container, box }) => [container.id, { old: container, box }]));
  const livePoints = new Map(); // arrowId -> absolute points, updated across containers

  for (const arrow of byId.values()) {
    if (arrow.type !== "arrow" || arrow.isDeleted) continue;
    const ends = [["startBinding", 0], ["endBinding", -1]];
    for (const [key, which] of ends) {
      const target = boxes.get(arrow[key]?.elementId);
      if (!target) continue;
      const points = livePoints.get(arrow.id) || getAbsolutePoints(arrow);
      const index = which === 0 ? 0 : points.length - 1;
      const next = points.slice();
      next[index] = remapAttachedPoint(points[index], target.old, target.box, target.old.angle || 0);
      livePoints.set(arrow.id, next);
    }
  }

  for (const [arrowId, points] of livePoints) {
    const arrow = byId.get(arrowId);
    const routed = arrow.elbowed ? normalizeOrthogonalPath(points) : points;
    patches.set(arrowId, { ...bumpFields(arrow), ...absolutePointsToPatch(routed) });
  }
}
