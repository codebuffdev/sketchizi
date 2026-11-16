import { useEffect, useState } from "react";
import { calculateAlignmentGuides, calculateEqualSpacingGuides, calculateTextBaselineGuides, selectDisplayGuides, getGuideRenderAxis, sceneToCanvasPixel } from "../../features/canvas/alignmentGuides.js";

const EMPTY_GUIDES = [];

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  const [overlay, setOverlay] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) {
      setGuides(EMPTY_GUIDES);
      return undefined;
    }
    let dragging = false;
    let activePointerId = null;
    let frame = 0;
    let lastPointer = null;

    const clear = () => {
      dragging = false;
      activePointerId = null;
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
      const viewport = root.querySelector('.excalidraw');
      if (!viewport) { setGuides(EMPTY_GUIDES); return; }
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({ left: viewportRect.left - rootRect.left, top: viewportRect.top - rootRect.top, width: viewportRect.width, height: viewportRect.height });
      const tolerance = 9 / zoom;
      const found = [
        ...calculateAlignmentGuides(elements, selectedIds, tolerance),
        ...calculateEqualSpacingGuides(elements, selectedIds, tolerance),
        ...calculateTextBaselineGuides(elements, selectedIds, tolerance),
      ];
      const toLocal = (axis, position) => sceneToCanvasPixel(
        position, axis === "x" ? appState.scrollX : appState.scrollY, zoom,
      );
      setGuides(selectDisplayGuides(found).map((guide) => {
        const displayAxis = getGuideRenderAxis(guide);
        const crossAxis = displayAxis === "x" ? "y" : "x";
        return {
          ...guide,
          displayAxis,
          screenPosition: toLocal(displayAxis, guide.position),
          screenStart: toLocal(crossAxis, guide.start),
          screenEnd: toLocal(crossAxis, guide.end),
        };
      }).filter((guide) => Number.isFinite(guide.screenPosition) && Number.isFinite(guide.screenStart) && Number.isFinite(guide.screenEnd)));
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
      // An object can be selected by this very pointerdown. Do not require
      // a pre-existing selection, or the first drag of an unselected object
      // will never display guides. Scene selection is read on each frame.
      if (appState.activeTool?.type && appState.activeTool.type !== "selection") return;
      if (event.isPrimary === false) return;
      dragging = true;
      activePointerId = event.pointerId;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    const onPointerMove = (event) => {
      if (!dragging || event.pointerId !== activePointerId) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    const onPointerEnd = (event) => {
      if (event.pointerId === activePointerId) clear();
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      clear();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled]);

  if (!guides.length) return null;
  return (
    <svg className="sketchizi-alignment-guides" style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }} viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)} aria-hidden="true" focusable="false">
      {guides.map((guide, index) => guide.displayAxis === "x" ? (
        <line key={guide.kind + guide.axis + guide.screenPosition + index} data-guide-kind={guide.kind || "alignment"} x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
      ) : (
        <line key={guide.kind + guide.axis + guide.screenPosition + index} data-guide-kind={guide.kind || "alignment"} x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
      ))}
    </svg>
  );
}
