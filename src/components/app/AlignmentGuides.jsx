import { useEffect, useState } from "react";
import { calculateAlignmentGuides } from "../../features/canvas/alignmentGuides.js";
import { calculateEqualSpacingGuides } from "../../features/canvas/smartSnapping.js";

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
    let frame = 0;
    let lastPointer = null;
    let gesture = null;
    let gestureSequence = 0;

    const clear = () => {
      gestureSequence += 1;
      dragging = false;
      lastPointer = null;
      gesture = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setGuides(EMPTY_GUIDES);
    };

    const update = () => {
      frame = 0;
      if (!dragging || !lastPointer) return;
      const api = apiRef?.current;
      if (!api) return;
      let appState = api.getAppState?.() || {};
      let elements = api.getSceneElements?.() || [];
      const selectedIds = new Set(Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id));
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);

      const rootRect = root.getBoundingClientRect();
      const viewport = root.querySelector(".excalidraw");
      if (!viewport) { setGuides(EMPTY_GUIDES); return; }
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({ left: viewportRect.left - rootRect.left, top: viewportRect.top - rootRect.top, width: viewportRect.width, height: viewportRect.height });
      const found = calculateAlignmentGuides(elements, selectedIds, 9 / zoom);
      const spacing = calculateEqualSpacingGuides(elements, selectedIds, 4 / zoom).map((guide) => ({ ...guide, kind: "spacing" }));
      const sceneToViewport = api.sceneCoordsToViewportCoords;
      const toLocal = (axis, position) => {
        if (typeof sceneToViewport === "function") {
          const point = sceneToViewport({
            sceneX: axis === "x" ? position : 0,
            sceneY: axis === "y" ? position : 0,
          });
          return axis === "x" ? point.x : point.y;
        }
        const offset = axis === "x" ? (Number(appState.scrollX) || 0) : (Number(appState.scrollY) || 0);
        return (position + offset) * zoom;
      };
      const alignmentScreenGuides = found.map((guide) => ({
        ...guide,
        kind: "alignment",
        screenPosition: toLocal(guide.axis, guide.position),
        screenStart: toLocal(guide.axis === "x" ? "y" : "x", guide.start),
        screenEnd: toLocal(guide.axis === "x" ? "y" : "x", guide.end),
      }));
      const spacingScreenGuides = spacing.map((guide) => ({
        ...guide,
        screenPosition: toLocal(guide.axis === "x" ? "y" : "x", guide.position),
        screenStart: toLocal(guide.axis, guide.start),
        screenEnd: toLocal(guide.axis, guide.end),
      }));
      setGuides(alignmentScreenGuides.concat(spacingScreenGuides).filter((guide) =>
        Number.isFinite(guide.screenPosition) && Number.isFinite(guide.screenStart) && Number.isFinite(guide.screenEnd)));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || !target?.closest(".excalidraw")) return;
      if (target.closest("button, input, textarea, select, [role='menu'], .App-menu, .Island, .popover")) return;
      const sequence = ++gestureSequence;
      const pointer = { x: event.clientX, y: event.clientY };
      // Selection of an unselected shape is committed by Excalidraw during
      // this pointerdown. Defer the snapshot until that handler has run.
      queueMicrotask(() => {
        if (sequence !== gestureSequence) return;
        const api = apiRef?.current;
        const appState = api?.getAppState?.() || {};
        const selectedIds = new Set(Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id));
        if (!selectedIds.size || !api) return;
        const elements = api.getSceneElements?.() || [];
        gesture = {
          selectedIds,
          baseline: new Map(elements.filter((element) => element && !element.isDeleted && !element.deleted).map((element) => [
            element.id,
            { x: element.x, y: element.y, width: element.width, height: element.height, angle: element.angle, type: element.type },
          ])),
        };
        dragging = true;
        lastPointer = pointer;
        scheduleUpdate();
      });
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
    <svg className="sketchizi-alignment-guides" style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }} viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)} aria-hidden="true" focusable="false">
      {guides.map((guide, index) => {
        const key = guide.kind + guide.axis + guide.screenPosition + index;
        if (guide.kind === "spacing") {
          return guide.axis === "x" ? (
            <g key={key} className="sketchizi-spacing-guide">
              <line x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
              <line x1={guide.screenStart} x2={guide.screenStart} y1={guide.screenPosition - 3} y2={guide.screenPosition + 3} />
              <line x1={guide.screenEnd} x2={guide.screenEnd} y1={guide.screenPosition - 3} y2={guide.screenPosition + 3} />
            </g>
          ) : (
            <g key={key} className="sketchizi-spacing-guide">
              <line x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
              <line x1={guide.screenPosition - 3} x2={guide.screenPosition + 3} y1={guide.screenStart} y2={guide.screenStart} />
              <line x1={guide.screenPosition - 3} x2={guide.screenPosition + 3} y1={guide.screenEnd} y2={guide.screenEnd} />
            </g>
          );
        }
        return guide.axis === "x" ? (
          <line key={key} x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
        ) : (
          <line key={key} x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
        );
      })}
    </svg>
  );
}
