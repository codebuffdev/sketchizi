// Center pasted content in the visible viewport.
//
// Excalidraw places pasted text/elements from the last pointer position, which is
// stale (or the corner) when the cursor has not moved over the canvas. After a
// paste lands, this module finds the new elements and moves them as one group so
// the group's center sits on the center of the current viewport.

export const STAGGER_PX = 20;
export const STAGGER_CYCLE = 10;

/** Scene point at the middle of the visible canvas (Excalidraw: scene = screen / zoom - scroll). */
export function viewportCenterScene(appState = {}) {
  const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
  return {
    cx: (Number(appState.width) || 800) / 2 / zoom - (Number(appState.scrollX) || 0),
    cy: (Number(appState.height) || 600) / 2 / zoom - (Number(appState.scrollY) || 0),
  };
}

/** Axis-aligned bounds of a set of elements (linear elements use their points). */
export function boundsOf(elements) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const element of elements) {
    const x = Number(element.x) || 0; const y = Number(element.y) || 0;
    let x1 = x; let y1 = y; let x2 = x + (Number(element.width) || 0); let y2 = y + (Number(element.height) || 0);
    if (Array.isArray(element.points) && element.points.length) {
      const xs = element.points.map((p) => x + (Number(p[0]) || 0)); const ys = element.points.map((p) => y + (Number(p[1]) || 0));
      x1 = Math.min(...xs); x2 = Math.max(...xs); y1 = Math.min(...ys); y2 = Math.max(...ys);
    }
    minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2); minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Translation that puts the bounds' center on (cx + offset, cy + offset). */
export function centeringDelta(bounds, center, offset = 0) {
  return {
    dx: center.cx + offset - (bounds.minX + bounds.width / 2),
    dy: center.cy + offset - (bounds.minY + bounds.height / 2),
  };
}

export const contentKey = (elements) => elements
  .map((e) => `${e.type}:${Math.round(e.width || 0)}x${Math.round(e.height || 0)}:${e.originalText ?? e.text ?? e.fileId ?? ""}`)
  .sort().join("|");

/** +20px staggering only for identical content pasted again without moving the camera. */
export function createPasteStagger() {
  let last = null;
  return {
    next(key, appState = {}) {
      const camera = `${Math.round(Number(appState.scrollX) || 0)}:${Math.round(Number(appState.scrollY) || 0)}:${Number(appState.zoom?.value ?? appState.zoom) || 1}`;
      const repeat = last && last.key === key && last.camera === camera;
      const count = repeat ? (last.count + 1) % STAGGER_CYCLE : 0;
      last = { key, camera, count };
      return count * STAGGER_PX;
    },
    reset() { last = null; },
  };
}

/** Moved copies of `added` so their group is centered; originals are not mutated. */
export function centerElements(added, appState, offset = 0) {
  const bounds = boundsOf(added);
  if (!bounds) return added;
  const { dx, dy } = centeringDelta(bounds, viewportCenterScene(appState), offset);
  if (!dx && !dy) return added;
  return added.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy, version: (Number(element.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }));
}

const isEditable = (node) => Boolean(node) && (node.isContentEditable === true || /^(TEXTAREA|INPUT|SELECT)$/.test(String(node.tagName || "")) || Boolean(node.closest?.("textarea, input, [contenteditable='true'], .excalidraw-textEditorContainer")));

export function attachPasteCentering({ apiRef, neverCapture, doc = document, canCenter = () => true }) {
  const stagger = createPasteStagger();
  let poll = null;
  const stop = () => { if (poll !== null) { clearInterval(poll); poll = null; } };

  const onPaste = (event) => {
    const api = apiRef?.current;
    if (!api || !canCenter()) return;
    if (isEditable(event.target) || isEditable(doc.activeElement)) return; // pasting into a text editor
    if (event.clipboardData?.files?.length) return; // images already center themselves
    stop(); // one watcher at a time: rapid Ctrl+V never stacks pollers
    const known = new Set((api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || []).map((e) => e.id));
    let tries = 0;
    poll = setInterval(() => {
      tries += 1;
      const scene = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      const added = scene.filter((e) => !known.has(e.id) && !e.isDeleted);
      if (!added.length) { if (tries > 40) stop(); return; }
      stop();
      const appState = api.getAppState?.() || {};
      const offset = stagger.next(contentKey(added), appState);
      const moved = new Map(centerElements(added, appState, offset).map((e) => [e.id, e]));
      api.updateScene({ elements: scene.map((e) => moved.get(e.id) || e), ...(neverCapture !== undefined ? { captureUpdate: neverCapture } : {}) });
    }, 50);
  };
  doc.addEventListener("paste", onPaste, true);
  return () => { doc.removeEventListener("paste", onPaste, true); stop(); };
}
