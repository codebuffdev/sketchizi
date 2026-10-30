import { useEffect, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { calculateAlignmentGuides } from "../../features/canvas/alignmentGuides.js";
import { calculateEqualSpacingGuides, snapSceneElementsToSmartGuides } from "../../features/canvas/smartSnapping.js";

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
    let gesture = null;
    let sequence = 0;

    const clearVisuals = () => setGuides(EMPTY_GUIDES);
    const cancelGesture = () => {
      sequence += 1;
      dragging = false;
      gesture = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clearVisuals();
    };

    const update = () => {
      frame = 0;
      if (!dragging || !gesture) return;
      const api = apiRef?.current;
      if (!api) return;
      const appState = api.getAppState?.() || {};
      const elements = api.getSceneElements?.() || [];
      const selectedIds = new Set(Object.entries(appState.selectedElementIds || {})
        .filter(([, selected]) => selected).map(([id]) => id));
      if (![...gesture.selectedIds].some((id) => selectedIds.has(id))) {
        clearVisuals();
        return;
      }

      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const rootRect = root.getBoundingClientRect();
      const viewport = root.querySelector(".excalidraw");
      if (!viewport) { clearVisuals(); return; }
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({
        left: viewportRect.left - rootRect.left,
        top: viewportRect.top - rootRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      });

      // Guides are a read-only preview while Excalidraw owns the pointer
      // gesture. Mutating its scene during pointermove fights its drag engine.
      const found = calculateAlignmentGuides(elements, selectedIds, 10 / zoom);
      const spacing = calculateEqualSpacingGuides(elements, selectedIds, 5 / zoom)
        .map((guide) => ({ ...guide, kind: "spacing" }));
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
        Number.isFinite(guide.screenPosition) &&
        Number.isFinite(guide.screenStart) &&
        Number.isFinite(guide.screenEnd)));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const onPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || !target?.closest(".excalidraw")) return;
      if (target.closest("button, input, textarea, select, [role='menu'], .App-menu, .Island, .popover")) return;
      const currentSequence = ++sequence;
      queueMicrotask(() => {
        if (currentSequence !== sequence) return;
        const api = apiRef?.current;
        if (!api) return;
        const appState = api.getAppState?.() || {};
        const selectedIds = new Set(Object.entries(appState.selectedElementIds || {})
          .filter(([, selected]) => selected).map(([id]) => id));
        if (!selectedIds.size) return;
        const elements = api.getSceneElements?.() || [];
        gesture = {
          selectedIds,
          baseline: new Map(elements.filter((element) => element && !element.isDeleted && !element.deleted)
            .map((element) => [element.id, {
              x: element.x, y: element.y, width: element.width, height: element.height,
              angle: element.angle, type: element.type,
            }])),
        };
        dragging = true;
        scheduleUpdate();
      });
    };

    const onPointerMove = () => {
      if (dragging) scheduleUpdate();
    };

    const onPointerUp = () => {
      if (!dragging || !gesture) {
        cancelGesture();
        return;
      }
      const completedGesture = gesture;
      // Run after Excalidraw's pointerup handlers so the final drag position
      // is present in the scene before we apply one final magnetic adjustment.
      queueMicrotask(() => {
        const api = apiRef?.current;
        if (api) {
          const elements = api.getSceneElements?.() || [];
          const appState = api.getAppState?.() || {};
          const selectedIds = new Set(Object.entries(appState.selectedElementIds || {})
            .filter(([, selected]) => selected).map(([id]) => id));
          if ([...completedGesture.selectedIds].some((id) => selectedIds.has(id))) {
            const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
            const snapped = snapSceneElementsToSmartGuides(
              elements, completedGesture.baseline, completedGesture.selectedIds, 8 / zoom,
            );
            if (snapped !== elements) {
              api.updateScene?.({ elements: snapped, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
            }
          }
        }
        cancelGesture();
      });
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cancelGesture);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", cancelGesture);
      cancelGesture();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled]);

  if (!guides.length) return null;
  return (
    <svg className="sketchizi-alignment-guides" style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }}
      viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)} aria-hidden="true" focusable="false">
      {guides.map((guide, index) => {
        const key = guide.kind + guide.axis + guide.screenPosition + index;
        if (guide.kind === "spacing") {
          return guide.axis === "x" ? (
            <g key={key} className="sketchizi-spacing-guide">
              <line x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
              <line x1={guide.screenStart} x2={guide.screenStart} y1={guide.screenPosition - 4} y2={guide.screenPosition + 4} />
              <line x1={guide.screenEnd} x2={guide.screenEnd} y1={guide.screenPosition - 4} y2={guide.screenPosition + 4} />
            </g>
          ) : (
            <g key={key} className="sketchizi-spacing-guide">
              <line x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
              <line x1={guide.screenPosition - 4} x2={guide.screenPosition + 4} y1={guide.screenStart} y2={guide.screenStart} />
              <line x1={guide.screenPosition - 4} x2={guide.screenPosition + 4} y1={guide.screenEnd} y2={guide.screenEnd} />
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
