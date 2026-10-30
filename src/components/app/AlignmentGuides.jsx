import { useEffect, useState } from "react";
import {
  calculateAlignmentGuides,
  findNearestAlignment,
  findNearestEqualSpacing,
  getElementBounds,
} from "../../features/canvas/alignmentGuides.js";

const EMPTY_GUIDES = [];

function getSelectedIds(appState) {
  return new Set(Object.entries(appState?.selectedElementIds || {})
    .filter(([, selected]) => selected).map(([id]) => id));
}

function sceneToOverlay(api, axis, position, appState, viewportRect) {
  if (typeof api.sceneCoordsToViewportCoords === "function") {
    const point = api.sceneCoordsToViewportCoords({
      sceneX: axis === "x" ? position : 0,
      sceneY: axis === "y" ? position : 0,
    });
    return axis === "x" ? point.x : point.y;
  }
  const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
  const offset = axis === "x" ? Number(appState.scrollX) || 0 : Number(appState.scrollY) || 0;
  return (position + offset) * zoom;
}

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled, apiReady }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  const [overlay, setOverlay] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const root = canvasRootRef.current;
    const api = apiRef?.current;
    if (!root || !api || !apiReady || !canEdit || viewModeEnabled) {
      setGuides(EMPTY_GUIDES);
      return undefined;
    }

    let gesture = null;
    let frame = 0;
    let lastPointer = null;

    const clear = () => {
      gesture = null;
      lastPointer = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setGuides(EMPTY_GUIDES);
    };

    const update = () => {
      frame = 0;
      if (!gesture || !lastPointer) return;
      const appState = api.getAppState?.() || {};
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const dx = (lastPointer.x - gesture.start.x) / zoom;
      const dy = (lastPointer.y - gesture.start.y) / zoom;
      const moving = gesture.elements.filter((element) => gesture.ids.has(element.id)).map((element) => {
        const base = gesture.baseline.get(element.id);
        return { ...element, x: base.x + dx, y: base.y + dy };
      });
      const stationary = gesture.elements.filter((element) => !gesture.ids.has(element.id));
      const tolerance = 8 / zoom;
      const alignmentX = findNearestAlignment(moving, stationary, "x", tolerance);
      const alignmentY = findNearestAlignment(moving, stationary, "y", tolerance);
      const spacingX = moving.length === 1 ? findNearestEqualSpacing(moving, stationary, "x", tolerance) : null;
      const spacingY = moving.length === 1 ? findNearestEqualSpacing(moving, stationary, "y", tolerance) : null;
      const choose = (alignment, spacing) => {
        if (!alignment) return spacing;
        if (!spacing) return alignment;
        return Math.abs(alignment.delta) <= Math.abs(spacing.delta) ? { ...alignment, kind: "alignment" } : { ...spacing, kind: "spacing" };
      };
      const snapX = choose(alignmentX && { ...alignmentX, kind: "alignment" }, spacingX);
      const snapY = choose(alignmentY && { ...alignmentY, kind: "alignment" }, spacingY);
      const correctionX = snapX?.delta || 0;
      const correctionY = snapY?.delta || 0;

      if ((correctionX || correctionY) && !lastPointer.altKey) {
        const current = api.getSceneElements?.() || [];
        const corrected = current.map((element) => {
          if (!gesture.ids.has(element.id)) return element;
          const base = gesture.baseline.get(element.id);
          return {
            ...element,
            x: base.x + dx + correctionX,
            y: base.y + dy + correctionY,
            version: (Number(element.version) || 0) + 1,
            versionNonce: Math.floor(Math.random() * 2147483647),
            updated: Date.now(),
          };
        });
        api.updateScene?.({ elements: corrected });
      }

      const viewport = root.querySelector(".excalidraw");
      if (!viewport) { setGuides(EMPTY_GUIDES); return; }
      const rootRect = root.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({ left: viewportRect.left - rootRect.left, top: viewportRect.top - rootRect.top, width: viewportRect.width, height: viewportRect.height });

      const currentElements = api.getSceneElements?.() || [];
      const selectedIds = gesture.ids;
      const liveGuides = calculateAlignmentGuides(currentElements, selectedIds, Math.max(1, 1 / zoom));
      const movingLive = currentElements.filter((element) => selectedIds.has(element.id) && !element.isDeleted);
      const stationaryLive = currentElements.filter((element) => !selectedIds.has(element.id) && !element.isDeleted);
      const spacingGuides = [];
      for (const [axis, snap] of [["x", snapX], ["y", snapY]]) {
        if (!snap || snap.kind !== "spacing") continue;
        const item = movingLive.find((element) => element.id === snap.itemId) || movingLive[0];
        if (!item) continue;
        const bounds = getElementBounds(item);
        const position = axis === "x"
          ? (snap.edge === "start" ? bounds.left : bounds.right)
          : (snap.edge === "start" ? bounds.top : bounds.bottom);
        const start = axis === "x" ? Math.min(...movingLive.map((e) => e.y), ...stationaryLive.map((e) => e.y)) : Math.min(...movingLive.map((e) => e.x), ...stationaryLive.map((e) => e.x));
        const end = axis === "x" ? Math.max(...movingLive.map((e) => e.y + e.height), ...stationaryLive.map((e) => e.y + e.height)) : Math.max(...movingLive.map((e) => e.x + e.width), ...stationaryLive.map((e) => e.x + e.width));
        spacingGuides.push({ axis, position, start: start - 12, end: end + 12, kind: "spacing" });
      }
      const allGuides = [...liveGuides, ...spacingGuides];
      setGuides(allGuides.map((guide) => ({
        ...guide,
        screenPosition: sceneToOverlay(api, guide.axis, guide.position, appState, viewportRect),
        screenStart: sceneToOverlay(api, guide.axis === "x" ? "y" : "x", guide.start, appState, viewportRect),
        screenEnd: sceneToOverlay(api, guide.axis === "x" ? "y" : "x", guide.end, appState, viewportRect),
      })).filter((guide) => Number.isFinite(guide.screenPosition) && Number.isFinite(guide.screenStart) && Number.isFinite(guide.screenEnd)));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const unsubscribeDown = api.onPointerDown?.((activeTool, pointerDownState, event) => {
      if (!event || event.button !== 0) return;
      const selectedIds = getSelectedIds(api.getAppState?.());
      const hit = pointerDownState?.hit?.element;
      if (!selectedIds.size && hit?.id) selectedIds.add(hit.id);
      if (!selectedIds.size) return;
      const elements = (api.getSceneElements?.() || []).filter((element) => !element.isDeleted && !element.deleted);
      const ids = new Set([...selectedIds].filter((id) => elements.some((element) => element.id === id)));
      if (!ids.size) return;
      gesture = {
        ids,
        start: { x: event.clientX, y: event.clientY },
        elements,
        baseline: new Map(elements.map((element) => [element.id, {
          x: element.x, y: element.y, width: element.width, height: element.height,
        }])),
      };
      lastPointer = { x: event.clientX, y: event.clientY, altKey: event.altKey };
      setGuides(EMPTY_GUIDES);
    });
    const unsubscribeUp = api.onPointerUp?.(clear);
    const onPointerMove = (event) => {
      if (!gesture) return;
      lastPointer = { x: event.clientX, y: event.clientY, altKey: event.altKey };
      scheduleUpdate();
    };
    window.addEventListener("pointermove", onPointerMove, true);
    return () => {
      unsubscribeDown?.();
      unsubscribeUp?.();
      window.removeEventListener("pointermove", onPointerMove, true);
      clear();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled, apiReady]);

  if (!guides.length) return null;
  return (
    <svg className="sketchizi-alignment-guides" style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }} viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)} aria-hidden="true" focusable="false">
      {guides.map((guide, index) => guide.axis === "x" ? (
        <line className={guide.kind === "spacing" ? "is-spacing-guide" : undefined} key={guide.axis + guide.screenPosition + index} x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
      ) : (
        <line className={guide.kind === "spacing" ? "is-spacing-guide" : undefined} key={guide.axis + guide.screenPosition + index} x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
      ))}
    </svg>
  );
}
