import { useEffect, useState } from "react";
import { calculateAlignmentGuides } from "../../features/canvas/alignmentGuides.js";

const EMPTY_GUIDES = [];

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) {
      setGuides(EMPTY_GUIDES);
      return undefined;
    }
    let dragging = false;
    let frame = 0;
    let lastPointer = null;

    const clear = () => {
      dragging = false;
      lastPointer = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setGuides(EMPTY_GUIDES);
    };

    const update = () => {
      frame = 0;
      if (!dragging || !lastPointer) return;
      const api = apiRef?.current;
      if (!api) return;
      const appState = api.getAppState?.() || {};
      const selectedIds = new Set(Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id));
      const elements = api.getSceneElements?.() || [];
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const rootRect = root.getBoundingClientRect();
      const canvasRect = root.querySelector(".layer-canvas")?.getBoundingClientRect() || rootRect;
      const canvasOffsetX = canvasRect.left - rootRect.left;
      const canvasOffsetY = canvasRect.top - rootRect.top;
      const tolerance = 9 / zoom;
      const found = calculateAlignmentGuides(elements, selectedIds, tolerance);
      const sceneToViewport = api.sceneCoordsToViewportCoords;
      const toLocal = (axis, position) => {
        if (typeof sceneToViewport === "function") {
          const point = sceneToViewport({ x: axis === "x" ? position : 0, y: axis === "y" ? position : 0 });
          return (axis === "x" ? point.x + canvasOffsetX : point.y + canvasOffsetY);
        }
        const canvas = root.querySelector(".layer-canvas");
        const rect = canvas?.getBoundingClientRect() || rootRect;
        const offset = axis === "x" ? (Number(appState.scrollX) || 0) : (Number(appState.scrollY) || 0);
        const extent = axis === "x" ? (Number(appState.width) || rect.width) : (Number(appState.height) || rect.height);
        return (axis === "x" ? rect.left - rootRect.left : rect.top - rootRect.top) + (position + offset) * zoom + extent / 2;
      };
      setGuides(found.map((guide) => ({
        ...guide,
        screenPosition: toLocal(guide.axis, guide.position),
      })).filter((guide) => Number.isFinite(guide.screenPosition)));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || !target?.closest(".excalidraw")) return;
      // Selection handles and interaction overlays receive pointer events too;
      // listening only for .layer-canvas misses those normal drag gestures.
      if (target.closest("button, input, textarea, select, [role='menu'], .App-menu, .Island, .popover")) return;
      const appState = apiRef?.current?.getAppState?.() || {};
      const selectedIds = Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id);
      if (!selectedIds.length) return;
      dragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
      clear();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled]);

  if (!guides.length) return null;
  return (
    <svg className="sketchizi-alignment-guides" aria-hidden="true" focusable="false">
      {guides.map((guide, index) => guide.axis === "x" ? (
        <line key={guide.axis + guide.screenPosition + index} x1={guide.screenPosition} x2={guide.screenPosition} y1="0" y2="100%" />
      ) : (
        <line key={guide.axis + guide.screenPosition + index} x1="0" x2="100%" y1={guide.screenPosition} y2={guide.screenPosition} />
      ))}
    </svg>
  );
}
