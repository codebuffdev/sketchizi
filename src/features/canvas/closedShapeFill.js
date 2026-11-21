// Shared background-fill logic for closed shapes (rectangle, diamond, ellipse).
//
// Every UI that edits fill (tool options dock, floating formatting toolbar,
// properties panel) goes through here so that:
//  - picking a color immediately produces a visible fill (auto-solid),
//  - both selected shapes and Excalidraw's current-item defaults update,
//  - the scene hook can preserve the user's explicit preference.

export const CLOSED_SHAPE_TYPES = Object.freeze(["rectangle", "diamond", "ellipse"]);
export const FILL_PREFERENCE_EVENT = "sketchizi:fill-preference";
export const DEFAULT_FILL_COLOR = "#a8c7e5";
export const FILL_PATTERNS = Object.freeze(["solid", "hachure", "cross-hatch"]);

export const isClosedShapeType = (type) => CLOSED_SHAPE_TYPES.includes(type);
export const isClosedShape = (element) =>
  Boolean(element) && isClosedShapeType(element.type) && !element.isDeleted && !element.deleted;

export function isTransparentFill(color) {
  if (color == null || color === "") return true;
  const value = String(color).trim().toLowerCase();
  if (value === "transparent") return true;
  if (/^#[\da-f]{8}$/.test(value)) return value.endsWith("00");
  if (/^#[\da-f]{4}$/.test(value)) return value.endsWith("0");
  return false;
}

let explicitPattern = null;
export const getExplicitFillPattern = () => explicitPattern;
export const resetExplicitFillPattern = () => { explicitPattern = null; };

export function resolveFillPatch(patch, prior = {}) {
  if (!patch) return patch;
  const next = { ...patch };
  if ("fillStyle" in next) {
    explicitPattern = next.fillStyle === "hachure" || next.fillStyle === "cross-hatch" ? next.fillStyle : null;
  }
  if (!("backgroundColor" in next) || isTransparentFill(next.backgroundColor)) return next;
  if ("fillStyle" in next) return next;
  const needsStyle = isTransparentFill(prior?.backgroundColor) || !prior?.fillStyle;
  if (needsStyle) next.fillStyle = explicitPattern || "solid";
  return next;
}

export const hasFillKeys = (patch) => Boolean(patch) && ("backgroundColor" in patch || "fillStyle" in patch);

export function splitFillPatch(patch) {
  const fill = {};
  const rest = {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (key === "backgroundColor" || key === "fillStyle") fill[key] = value;
    else rest[key] = value;
  });
  return { fill, rest };
}

export function fillAppStatePatch(patch) {
  const appState = {};
  if (patch && "backgroundColor" in patch) appState.currentItemBackgroundColor = patch.backgroundColor;
  if (patch && "fillStyle" in patch) appState.currentItemFillStyle = patch.fillStyle;
  return appState;
}

const nextVersion = (element, now) => ({
  version: (Number(element.version) || 0) + 1,
  versionNonce: Math.floor(Math.random() * 2147483647),
  updated: now,
});

export function applyFillToClosedShapes(elements, ids, patch, now = Date.now()) {
  const resolvedByElement = [];
  const next = (elements || []).map((element) => {
    if (!ids.has(element.id) || !isClosedShape(element)) return element;
    let resolved = resolveFillPatch(patch, element);
    if (resolved.fillStyle && !("backgroundColor" in resolved) && isTransparentFill(element.backgroundColor)) {
      resolved = { ...resolved, backgroundColor: DEFAULT_FILL_COLOR };
    }
    resolvedByElement.push(resolved);
    return { ...element, ...resolved, ...nextVersion(element, now) };
  });
  return { elements: next, resolved: resolvedByElement, changed: resolvedByElement.length > 0 };
}

export function getLiveSelectedIds(api, extraIds = []) {
  const ids = new Set(extraIds);
  const selected = api?.getAppState?.()?.selectedElementIds || {};
  Object.entries(selected).forEach(([id, active]) => { if (active) ids.add(id); });
  return ids;
}

export function syncFillDefaults(api, resolvedPatch, captureUpdate) {
  const appState = fillAppStatePatch(resolvedPatch);
  if (!Object.keys(appState).length) return;
  const payload = { appState };
  if (captureUpdate !== undefined) payload.captureUpdate = captureUpdate;
  api?.updateScene?.(payload);
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent(FILL_PREFERENCE_EVENT, { detail: { ...appState } }));
  }
}

export function applyClosedShapeFill(api, patch, { selectedIds = [], captureUpdate } = {}) {
  if (!api?.updateScene || !hasFillKeys(patch)) return null;
  const appState = api.getAppState?.() || {};
  const ids = getLiveSelectedIds(api, selectedIds);
  const elements = api.getSceneElements?.() || [];
  const { elements: nextElements, resolved, changed } = applyFillToClosedShapes(elements, ids, patch);

  let defaults;
  if (changed) {
    defaults = resolved[0];
  } else {
    defaults = resolveFillPatch(patch, {
      backgroundColor: appState.currentItemBackgroundColor,
      fillStyle: appState.currentItemFillStyle,
    });
    if (defaults.fillStyle && !("backgroundColor" in defaults) && isTransparentFill(appState.currentItemBackgroundColor)) {
      defaults = { ...defaults, backgroundColor: DEFAULT_FILL_COLOR };
    }
  }

  const payload = { appState: fillAppStatePatch(defaults) };
  if (changed) {
    payload.elements = nextElements;
    if (captureUpdate !== undefined) payload.captureUpdate = captureUpdate;
  }
  api.updateScene(payload);
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent(FILL_PREFERENCE_EVENT, { detail: fillAppStatePatch(defaults) }));
  }
  return defaults;
}

export function reconcileFillDefaults({ preferred, liveAppState }) {
  const live = liveAppState || {};
  if (live.openPopup === "elementBackground") {
    return {
      preferred: {
        currentItemBackgroundColor: live.currentItemBackgroundColor,
        currentItemFillStyle: live.currentItemFillStyle,
      },
      patch: null,
    };
  }
  if (!preferred) return { preferred: null, patch: null };
  const patch = {};
  Object.entries(preferred).forEach(([key, value]) => {
    if (value !== undefined && live[key] !== value) patch[key] = value;
  });
  return { preferred, patch: Object.keys(patch).length ? patch : null };
}
