// Smart Connect: ONE geometry pipeline shared by `line` and `arrow` connectors.
//
//   resolveSmartBinding()       pointer / endpoint  -> binding target + anchor on the border
//   anchorFromBinding()         stored binding      -> anchor on the (moved / resized) border
//   recomputeBoundConnector()   connector + scene   -> new endpoint positions
//   reconcileConnectors()       whole scene         -> patches (move, resize, undo/redo, duplicate)
//
// Pure data in / data out (no DOM, no Excalidraw imports) so it runs under `node --test`.
// All tolerances are expressed in SCREEN pixels and divided by zoom, so snapping feels
// identical at 50 %, 100 % and 200 %. Anchors are always projected onto the exact outer
// border (gap 0): arrowheads and line ends touch the shape, they never float.
import { absolutePointsToPatch, getAbsolutePoints } from "./arrowRouting.js";

export const SNAP_RADIUS_PX = 22;   // stickiness of the shape currently being targeted
export const BORDER_REACH_PX = 14;  // outside (or just inside) the border still binds
export const PORT_MAGNET_PX = 16;   // pull onto the 4 cardinal edge midpoints
export const BINDING_DATA_KEY = "connectorBinding"; // customData mirror (lines lose top-level bindings on restore)
export const SIDES = ["top", "right", "bottom", "left"];
export const CONNECTOR_TYPES = new Set(["arrow", "line"]);

const FRAME_TYPES = new Set(["frame", "magicframe"]);
const CODE_BLOCK_KEY = "codeBlock";
const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ids of connectors currently being drawn / dragged by an editor; reconcile leaves them alone. */
export const connectorActivity = { dragId: null };

/* ---------- normalised shape frame ---------- */

/** minX/minY/maxX/maxY with width,height > 0 regardless of draw direction; null when degenerate. */
export function normalizeBounds(element) {
  if (!element) return null;
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const w = Number(element.width) || 0;
  const h = Number(element.height) || 0;
  const minX = Math.min(x, x + w);
  const maxX = Math.max(x, x + w);
  const minY = Math.min(y, y + h);
  const maxY = Math.max(y, y + h);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width >= 1) || !(height >= 1)) return null;
  return { minX, minY, maxX, maxY, width, height, cx: minX + width / 2, cy: minY + height / 2 };
}

export function isFrameType(element) {
  return FRAME_TYPES.has(element?.type);
}

export function isConnectableShape(element) {
  if (!element || element.isDeleted) return false;
  const t = element.type;
  const ok = t === "rectangle" || t === "diamond" || t === "ellipse" || FRAME_TYPES.has(t)
    || (t === "image" && Boolean(element.customData?.[CODE_BLOCK_KEY]));
  return ok && Boolean(normalizeBounds(element));
}

/** Excalidraw corner radius: proportional 25 %, adaptive 25 % capped at 32. */
function cornerRadius(element, bounds) {
  if (FRAME_TYPES.has(element.type)) return Math.min(8, bounds.width / 2, bounds.height / 2);
  if (element.type !== "rectangle" || !element.roundness) return 0;
  const m = Math.min(bounds.width, bounds.height);
  const type = element.roundness.type;
  if (type === 1) return m * 0.25;
  if (type === 3) return m <= 128 ? m * 0.25 : 32;
  return 0;
}

export function getShapeCornerRadius(element) {
  const b = normalizeBounds(element);
  return b ? cornerRadius(element, b) : 0;
}

function frameOf(element) {
  const b = normalizeBounds(element);
  return {
    ...b,
    a: b.width / 2,
    b: b.height / 2,
    angle: Number(element.angle) || 0,
    kind: element.type === "ellipse" ? "ellipse" : element.type === "diamond" ? "diamond" : "rect",
    r: cornerRadius(element, b),
  };
}

const toLocal = (f, p) => {
  const dx = p.x - f.cx; const dy = p.y - f.cy;
  const c = Math.cos(-f.angle); const s = Math.sin(-f.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
};
const toWorld = (f, p) => {
  const c = Math.cos(f.angle); const s = Math.sin(f.angle);
  return { x: f.cx + p.x * c - p.y * s, y: f.cy + p.x * s + p.y * c };
};

/* ---------- perimeter projection (local, centre-origin space) ---------- */

function projectRoundedRect(u, v, a, b, r) {
  const sx = u < 0 ? -1 : 1; const sy = v < 0 ? -1 : 1;
  const qx = Math.abs(u); const qy = Math.abs(v);
  const ix = a - r; const iy = b - r;
  let px; let py;
  if (qx > ix && qy > iy) {
    let dx = qx - ix; let dy = qy - iy;
    const len = Math.hypot(dx, dy);
    if (len < EPS) { dx = 1; dy = 1; } else { dx /= len; dy /= len; }
    const n = Math.hypot(dx, dy) || 1;
    px = ix + (r * dx) / n; py = iy + (r * dy) / n;
    if (r === 0) { px = a; py = b; }
  } else if (qx <= ix && qy > iy) { px = qx; py = b; }
  else if (qy <= iy && qx > ix) { px = a; py = qy; }
  else if (a - qx < b - qy) { px = a; py = qy; } else { px = qx; py = b; }
  const inside = (qx <= ix || qy <= iy) ? (qx <= a && qy <= b) : Math.hypot(qx - ix, qy - iy) <= r;
  const dist = Math.hypot(qx - px, qy - py);
  return { x: sx * px, y: sy * py, signed: inside ? -dist : dist };
}

function projectEllipse(u, v, a, b) {
  const sx = u < 0 ? -1 : 1; const sy = v < 0 ? -1 : 1;
  const px = Math.abs(u); const py = Math.abs(v);
  let tx = Math.SQRT1_2; let ty = Math.SQRT1_2;
  for (let i = 0; i < 10; i += 1) {
    const x = a * tx; const y = b * ty;
    const ex = ((a * a - b * b) * tx ** 3) / a;
    const ey = ((b * b - a * a) * ty ** 3) / b;
    const rx = x - ex; const ry = y - ey;
    const qx = px - ex; const qy = py - ey;
    const r = Math.hypot(rx, ry); const q = Math.hypot(qx, qy);
    if (q < EPS) break;
    tx = clamp((qx * r / q + ex) / a, 0, 1);
    ty = clamp((qy * r / q + ey) / b, 0, 1);
    const t = Math.hypot(tx, ty);
    if (t < EPS) break;
    tx /= t; ty /= t;
  }
  const x = sx * a * tx; const y = sy * b * ty;
  const inside = (u / a) ** 2 + (v / b) ** 2 <= 1;
  const dist = Math.hypot(u - x, v - y);
  return { x, y, signed: inside ? -dist : dist };
}

function projectDiamond(u, v, a, b) {
  const verts = [{ x: 0, y: -b }, { x: a, y: 0 }, { x: 0, y: b }, { x: -a, y: 0 }];
  let best = null;
  for (let i = 0; i < 4; i += 1) {
    const p = verts[i]; const q = verts[(i + 1) % 4];
    const ex = q.x - p.x; const ey = q.y - p.y;
    const t = clamp(((u - p.x) * ex + (v - p.y) * ey) / (ex * ex + ey * ey), 0, 1);
    const x = p.x + ex * t; const y = p.y + ey * t;
    const d = Math.hypot(u - x, v - y);
    if (!best || d < best.d) best = { x, y, d };
  }
  const inside = Math.abs(u) / a + Math.abs(v) / b <= 1;
  return { x: best.x, y: best.y, signed: inside ? -best.d : best.d };
}

function projectToPerimeter(f, local) {
  if (f.kind === "ellipse") return projectEllipse(local.x, local.y, f.a, f.b);
  if (f.kind === "diamond") return projectDiamond(local.x, local.y, f.a, f.b);
  return projectRoundedRect(local.x, local.y, f.a, f.b, f.r);
}

/** Nearest point on the shape's outer border for a WORLD point. Returns { x, y, signed } (signed < 0 inside). */
export function projectOntoBorder(element, point) {
  const f = frameOf(element);
  const proj = projectToPerimeter(f, toLocal(f, point));
  return { ...toWorld(f, proj), signed: proj.signed };
}

/** World positions of the 4 cardinal edge midpoints, [{ side, shapeId, x, y }]. */
export function getConnectionPorts(element) {
  if (!isConnectableShape(element)) return [];
  const f = frameOf(element);
  return [["top", 0, -f.b], ["right", f.a, 0], ["bottom", 0, f.b], ["left", -f.a, 0]]
    .map(([side, x, y]) => ({ side, shapeId: element.id, ...toWorld(f, { x, y }) }));
}

/* ---------- smart binding resolution ---------- */

const fillsArea = (el) => isFrameType(el) ? false : Boolean(el.backgroundColor) && el.backgroundColor !== "transparent";

/**
 * Resolve where an endpoint at world `point` should bind.
 * - within 14/zoom of a border (either side) -> binds; inside a FILLED shape binds too
 *   (an unfilled container only binds at its border, like Excalidraw hit-testing, so arrows
 *   can still be drawn across the empty inside of a boundary box; frames are border-only).
 * - within 16/zoom of a cardinal midpoint -> snaps exactly onto that port, else projects onto
 *   the nearest perimeter point. `stickyId` keeps the current target within 22/zoom.
 * - `bypass` (Alt / Cmd held) disables all magnetism.
 */
export function resolveSmartBinding(point, elements, { zoom = 1, bypass = false, excludeIds = [], stickyId = null } = {}) {
  if (bypass || !point) return null;
  const z = Math.max(Number(zoom) || 1, 0.01);
  const reach = BORDER_REACH_PX / z;
  const stickyReach = SNAP_RADIUS_PX / z;
  const magnet = PORT_MAGNET_PX / z;
  const excluded = new Set(excludeIds);
  let edge = null; let contain = null; let sticky = null;
  for (const el of elements || []) {
    if (!el || excluded.has(el.id) || !isConnectableShape(el)) continue;
    const f = frameOf(el);
    const proj = projectToPerimeter(f, toLocal(f, point));
    const absD = Math.abs(proj.signed);
    const area = f.width * f.height;
    const cand = { el, f, proj, absD, area };
    if (absD <= reach) {
      if (!edge || absD < edge.absD - 1e-9 || (Math.abs(absD - edge.absD) <= 1e-9 && area < edge.area)) edge = cand;
    } else if (proj.signed < 0 && fillsArea(el)) {
      if (!contain || area < contain.area) contain = cand;
    }
    if (el.id === stickyId && proj.signed <= stickyReach) sticky = cand;
  }
  const pick = edge ?? sticky ?? contain;
  if (!pick) return null;

  const { el, f, proj } = pick;
  let local = { x: proj.x, y: proj.y };
  const ports = [["top", 0, -f.b], ["right", f.a, 0], ["bottom", 0, f.b], ["left", -f.a, 0]];
  let nearest = null;
  for (const [side, x, y] of ports) {
    const d = Math.hypot(local.x - x, local.y - y);
    if (!nearest || d < nearest.d) nearest = { side, x, y, d };
  }
  const portSnapped = nearest.d <= magnet;
  if (portSnapped) local = { x: nearest.x, y: nearest.y };
  const normalizedOffset = { x: clamp((local.x + f.a) / (2 * f.a), 0, 1), y: clamp((local.y + f.b) / (2 * f.b), 0, 1) };
  const world = toWorld(f, local);
  return {
    shapeId: el.id, shape: el, side: nearest.side, portSnapped, normalizedOffset,
    point: world, x: world.x, y: world.y, distance: proj.signed,
  };
}

/** Anchor (world) of a stored binding on the shape's CURRENT geometry - always on the border. */
export function anchorFromBinding(shape, binding) {
  const f = frameOf(shape);
  const o = binding.normalizedOffset;
  const local = { x: -f.a + clamp(o.x, 0, 1) * 2 * f.a, y: -f.b + clamp(o.y, 0, 1) * 2 * f.b };
  return toWorld(f, projectToPerimeter(f, local));
}

/* ---------- binding records ---------- */

export function makeBinding(snap) {
  const o = snap.normalizedOffset;
  return {
    elementId: snap.shapeId, focus: 0, gap: 0, // gap 0: border contact, nothing floats
    fixedPoint: [o.x, o.y], side: snap.side, normalizedOffset: { x: o.x, y: o.y },
  };
}

/**
 * Bindings of a connector as { start, end }, each null | { elementId, side, normalizedOffset }
 * | { elementId, native: true } (bound by Excalidraw without our metadata - adopted on reconcile).
 * Arrows: top-level fields are authoritative (Excalidraw clears them when the user unbinds).
 * Lines: top-level, falling back to the customData mirror (restore strips top-level on load).
 */
export function readConnectorBindings(connector) {
  const out = { start: null, end: null };
  if (!connector || !CONNECTOR_TYPES.has(connector.type)) return out;
  const mirror = connector.customData?.[BINDING_DATA_KEY];
  for (const which of ["start", "end"]) {
    const top = connector[`${which}Binding`];
    const record = top || (connector.type === "line" ? mirror?.[which] : null);
    if (!record?.elementId) continue;
    out[which] = record.normalizedOffset
      ? { elementId: record.elementId, side: record.side, normalizedOffset: record.normalizedOffset }
      : { elementId: record.elementId, native: true };
  }
  return out;
}

/**
 * Patch that (re)binds or unbinds (`snap` null) one end - same code path for line and arrow.
 * Returns { patch, shapeUpdates } where shapeUpdates maps shapeId -> boundElements (arrows only:
 * Excalidraw tracks bound arrows on the shape; lines are not bindable natively).
 */
export function getBindingChanges(connector, which, snap, scene = []) {
  const key = `${which}Binding`;
  const next = snap ? makeBinding(snap) : null;
  const patch = { [key]: next };
  if (connector.type === "line") {
    const mirror = { ...(connector.customData?.[BINDING_DATA_KEY] || {}) };
    if (next) mirror[which] = next; else delete mirror[which];
    patch.customData = { ...(connector.customData || {}), [BINDING_DATA_KEY]: mirror };
  }
  const shapeUpdates = new Map();
  if (connector.type === "arrow") {
    const previous = connector[key]?.elementId || null;
    const nextId = snap?.shapeId || null;
    if (previous !== nextId) {
      const byId = new Map(scene.map((el) => [el.id, el]));
      if (previous && byId.get(previous)) shapeUpdates.set(previous, (byId.get(previous).boundElements || []).filter((b) => b.id !== connector.id));
      if (nextId && byId.get(nextId)) {
        const existing = shapeUpdates.get(nextId) || byId.get(nextId).boundElements || [];
        shapeUpdates.set(nextId, existing.some((b) => b.id === connector.id) ? existing : [...existing, { id: connector.id, type: "arrow" }]);
      }
    }
  }
  return { patch, shapeUpdates };
}

/* ---------- recompute (shared by line + arrow) ---------- */

const movable = (c) => CONNECTOR_TYPES.has(c?.type) && !c.isDeleted && !c.elbowed && !(Math.abs(Number(c.angle) || 0) > 1e-6);

/**
 * Re-glue every bound endpoint of ONE connector onto its shape's current border.
 * Returns { points (absolute), changed } or null when the connector has no usable bindings.
 */
export function recomputeBoundConnector(connector, byId) {
  if (!movable(connector)) return null;
  const bindings = readConnectorBindings(connector);
  const points = getAbsolutePoints(connector).map((p) => ({ ...p }));
  if (points.length < 2) return null;
  let touched = false; let changed = false;
  for (const [which, index] of [["start", 0], ["end", points.length - 1]]) {
    const binding = bindings[which];
    const shape = binding && byId.get(binding.elementId);
    if (!binding || binding.native || !isConnectableShape(shape)) continue;
    const anchor = anchorFromBinding(shape, binding);
    touched = true;
    if (Math.hypot(anchor.x - points[index].x, anchor.y - points[index].y) > 0.01) changed = true;
    points[index] = anchor;
  }
  return touched ? { points, changed } : null;
}

/* ---------- scene reconcile: move / resize / undo / redo / duplicate ---------- */

export const createConnectorMemory = () => ({ ids: null, sig: new Map() });

const shapeSig = (el) => `${el.x}|${el.y}|${el.width}|${el.height}|${el.angle || 0}|${el.roundness?.type ?? ""}`;
const DEVIATION = 0.5;

/** Bump an element after patching so Excalidraw / collaboration treat it as changed. */
export function bumpElement(element, patch) {
  return {
    ...element, ...patch,
    version: (Number(element.version) || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

/**
 * Keeps every bound connector glued to its shape. Called from the scene-change hook, so a
 * shape drag, resize, align, arrow-key nudge, undo or redo is followed in the same tick.
 *
 *  - shape geometry changed since the last pass      -> endpoint follows the border
 *  - endpoint moved but the shape did not (user edit) -> that end is unbound
 *  - NEW connector bound to an old shape, whose end lies on a freshly cloned shape
 *    (Duplicate / copy-paste)                          -> binding re-mapped to the clone
 *  - bound natively by Excalidraw (no offset / gap)    -> adopted: stored with side +
 *    normalizedOffset and moved flush onto the border (gap 0)
 *
 * Mutates `memory`. Returns { patches: Map<id, patch>, shapePatches: Map<id, patch> }.
 */
export function reconcileConnectors(elements, { memory, activeIds = [] } = {}) {
  const patches = new Map();
  const shapePatches = new Map();
  const mem = memory || createConnectorMemory();
  const all = elements || [];
  const byIdAll = new Map(all.map((el) => [el.id, el]));
  const live = all.filter((el) => el && !el.isDeleted);
  const isFirst = mem.ids === null;
  const newIds = new Set(isFirst ? [] : live.filter((el) => !mem.ids.has(el.id)).map((el) => el.id));
  const newShapes = live.filter((el) => newIds.has(el.id) && isConnectableShape(el));
  const active = new Set(activeIds.filter(Boolean));

  for (const connector of live) {
    if (!movable(connector) || active.has(connector.id)) continue;
    const bindings = readConnectorBindings(connector);
    if (!bindings.start && !bindings.end) continue;
    let current = connector;
    const points = getAbsolutePoints(connector).map((p) => ({ ...p }));
    if (points.length < 2) continue;
    let pointsChanged = false; let dirty = false;
    let boundElementsPatch = new Map();
    const isNewConnector = newIds.has(connector.id);

    for (const [which, index] of [["start", 0], ["end", points.length - 1]]) {
      let binding = bindings[which];
      if (!binding) continue;
      let shape = byIdAll.get(binding.elementId);
      if (!shape) { // target gone for good: lines are ours to clean up, arrows are handled natively
        if (connector.type === "line") {
          const changes = getBindingChanges(current, which, null, all);
          current = { ...current, ...changes.patch }; dirty = true;
        }
        continue;
      }
      if (shape.isDeleted || !isConnectableShape(shape)) continue; // deleted (may be restored by undo) / not ours

      // Duplicate: a cloned connector still points at the original; find the clone it was drawn on.
      if (isNewConnector && !binding.native && !newIds.has(shape.id)) {
        const sb = normalizeBounds(shape);
        let best = null;
        for (const clone of newShapes) {
          const cb = normalizeBounds(clone);
          if (clone.type !== shape.type || Math.abs(cb.width - sb.width) > 0.01 || Math.abs(cb.height - sb.height) > 0.01) continue;
          if (Math.abs((Number(clone.angle) || 0) - (Number(shape.angle) || 0)) > 1e-6) continue;
          const a = anchorFromBinding(clone, binding);
          const d = Math.hypot(a.x - points[index].x, a.y - points[index].y);
          if (d <= 0.75 && (!best || d < best.d)) best = { clone, d };
        }
        if (best) {
          const snap = { shapeId: best.clone.id, side: binding.side, normalizedOffset: binding.normalizedOffset };
          const changes = getBindingChanges(current, which, snap, all);
          current = { ...current, ...changes.patch }; dirty = true;
          changes.shapeUpdates.forEach((v, k) => boundElementsPatch.set(k, v));
          binding = { elementId: best.clone.id, side: binding.side, normalizedOffset: binding.normalizedOffset };
          shape = best.clone;
        }
      }

      // Adopt a native Excalidraw binding: same record, flush border contact.
      if (binding.native) {
        const projected = projectOntoBorder(shape, points[index]);
        const f = frameOf(shape);
        const local = toLocal(f, projected);
        const normalizedOffset = { x: clamp((local.x + f.a) / (2 * f.a), 0, 1), y: clamp((local.y + f.b) / (2 * f.b), 0, 1) };
        let side = "top"; let bestD = Infinity;
        for (const [s, x, y] of [["top", 0, -f.b], ["right", f.a, 0], ["bottom", 0, f.b], ["left", -f.a, 0]]) {
          const d = Math.hypot(local.x - x, local.y - y);
          if (d < bestD) { bestD = d; side = s; }
        }
        const snap = { shapeId: shape.id, side, normalizedOffset };
        const changes = getBindingChanges(current, which, snap, all);
        current = { ...current, ...changes.patch }; dirty = true;
        points[index] = { x: projected.x, y: projected.y }; pointsChanged = true;
        continue;
      }

      const anchor = anchorFromBinding(shape, binding);
      const deviation = Math.hypot(anchor.x - points[index].x, anchor.y - points[index].y);
      if (deviation <= DEVIATION) continue;
      const shapeChanged = mem.sig.get(shape.id) !== shapeSig(shape);
      if (shapeChanged) {
        points[index] = anchor; pointsChanged = true;
      } else {
        const changes = getBindingChanges(current, which, null, all); // endpoint edited by the user
        current = { ...current, ...changes.patch }; dirty = true;
        changes.shapeUpdates.forEach((v, k) => boundElementsPatch.set(k, v));
      }
    }

    if (pointsChanged || dirty) {
      const patch = {};
      for (const key of ["startBinding", "endBinding", "customData"]) if (current[key] !== connector[key]) patch[key] = current[key];
      if (pointsChanged) Object.assign(patch, absolutePointsToPatch(points));
      patches.set(connector.id, patch);
      boundElementsPatch.forEach((value, id) => shapePatches.set(id, { boundElements: value }));
    }
  }

  mem.ids = new Set(live.map((el) => el.id));
  mem.sig = new Map(live.filter((el) => isConnectableShape(el)).map((el) => [el.id, shapeSig(el)]));
  return { patches, shapePatches };
}

/** Applies reconcile output to a scene array (new array; untouched elements keep identity). */
export function applyReconcile(elements, { patches, shapePatches }) {
  return elements.map((el) => {
    if (patches.has(el.id)) return bumpElement(el, patches.get(el.id));
    if (shapePatches.has(el.id)) return bumpElement(el, shapePatches.get(el.id));
    return el;
  });
}

/** Clones' ids remapped inside connector bindings (templates / paste): startBinding, endBinding and the customData mirror. */
export function remapConnectorBindingIds(element, idMap) {
  const mapId = (id) => idMap.get(id) || id;
  for (const key of ["startBinding", "endBinding"]) {
    if (element[key]?.elementId) element[key] = { ...element[key], elementId: mapId(element[key].elementId) };
  }
  const mirror = element.customData?.[BINDING_DATA_KEY];
  if (mirror) {
    const next = { ...mirror };
    for (const which of ["start", "end"]) if (next[which]?.elementId) next[which] = { ...next[which], elementId: mapId(next[which].elementId) };
    element.customData = { ...element.customData, [BINDING_DATA_KEY]: next };
  }
  return element;
}
