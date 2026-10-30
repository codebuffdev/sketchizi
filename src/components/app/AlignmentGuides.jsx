import { useEffect, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { calculateAlignmentGuides } from "../../features/canvas/alignmentGuides.js";
import { calculateEqualSpacingGuides, snapSceneElementsToSmartGuides } from "../../features/canvas/smartSnapping.js";

const EMPTY_GUIDES = [];

function selectedElementIds(appState) {
  return new Set(Object.entries(appState?.selectedElementIds || {})
    .filter(([, selected]) => selected)
    .map(([id]) => id));
}

function visibleElements(api) {
  return (api?.getSceneElements?.() || []).filter((element) =>
    element && !element.isDeleted && !element.deleted);
}

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  const [overlay, setOverlay] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const root = canvasRootRef.current;
    const api = apiRef?.current;
    if (!root || !api || !canEdit || viewModeEnabled) {
      setGuides(EMPTY_GUIDES);
      return undefined;
    }

    let gesture = null;
    let renderFrame = 0;
    let selectionFrame = 0;
    let finishFrame = 0;
    let latestPointer = null;

    const hide = () => setGuides(EMPTY_GUIDES);
    const cancelFrames = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      if (selectionFrame) cancelAnimationFrame(selectionFrame);
      if (finishFrame) cancelAnimationFrame(finishFrame);
      renderFrame = selectionFrame = finishFrame = 0;
    };

    const renderGuides = () => {
      renderFrame = 0;
      if (!gesture || !latestPointer) return;
      const appState = api.getAppState?.() || {};
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const dx = (latestPointer.x - gesture.pointer.x) / zoom;
      const dy = (latestPointer.y - gesture.pointer.y) / zoom;
      const preview = gesture.elements.map((element) => gesture.selectedIds.has(element.id)
        ? { ...element, x: element.x + dx, y: element.y + dy }
        : element);

      const found = calculateAlignmentGuides(preview, gesture.selectedIds, 10 / zoom);
      const spacing = calculateEqualSpacingGuides(preview, gesture.selectedIds, 5 / zoom)
        .map((guide) => ({ ...guide, kind: "spacing" }));

      const viewport = root.querySelector(".excalidraw");
      if (!viewport) { hide(); return; }
      const rootRect = root.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({
        left: viewportRect.left - rootRect.left,
        top: viewportRect.top - rootRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      });

      // Excalidraw 0.18 scene-to-screen transform: (scene + scroll) * zoom + offset.
      const toLocal = (axis, position) => {
        if (axis === "x") {
          return (position + (Number(appState.scrollX) || 0)) * zoom +
            (Number(appState.offsetLeft) || viewportRect.left) - viewportRect.left;
        }
        return (position + (Number(appState.scrollY) || 0)) * zoom +
          (Number(appState.offsetTop) || viewportRect.top) - viewportRect.top;
      };
      const alignmentScreen = found.map((guide) => ({
        ...guide,
        kind: "alignment",
        screenPosition: toLocal(guide.axis, guide.position),
        screenStart: toLocal(guide.axis === "x" ? "y" : "x", guide.start),
        screenEnd: toLocal(guide.axis === "x" ? "y" : "x", guide.end),
      }));
      const spacingScreen = spacing.map((guide) => ({
        ...guide,
        screenPosition: toLocal(guide.axis === "x" ? "y" : "x", guide.position),
        screenStart: toLocal(guide.axis, guide.start),
        screenEnd: toLocal(guide.axis, guide.end),
      }));
      setGuides(alignmentScreen.concat(spacingScreen).filter((guide) =>
        Number.isFinite(guide.screenPosition) &&
        Number.isFinite(guide.screenStart) &&
        Number.isFinite(guide.screenEnd)));
    };

    const scheduleRender = () => {
      if (!renderFrame) renderFrame = requestAnimationFrame(renderGuides);
    };

    // The pinned Excalidraw imperative API has no pointer subscription methods.
    // Observe its actual canvas DOM events and defer selection reads until its
    // own event handlers have completed.
    const onPointerDown = (event) => {
      if (event.button !== 0 || !event.target?.closest?.(".excalidraw")) return;
      cancelFrames();
      hide();
      gesture = null;
      latestPointer = { x: event.clientX, y: event.clientY };
      const pointer = latestPointer;
      selectionFrame = requestAnimationFrame(() => {
        selectionFrame = 0;
        if (!latestPointer || latestPointer !== pointer) return;
        const selectedIds = selectedElementIds(api.getAppState?.());
        const elements = visibleElements(api);
        if (![...selectedIds].some((id) => elements.some((element) => element.id === id))) return;
        gesture = {
          pointer,
          selectedIds,
          elements,
          baseline: new Map(elements.map((element) => [element.id, {
            x: element.x, y: element.y, width: element.width, height: element.height,
            angle: element.angle, type: element.type,
          }])),
        };
      });
    };

    const onPointerMove = (event) => {
      if (!latestPointer) return;
      latestPointer = { x: event.clientX, y: event.clientY };
      if (gesture) scheduleRender();
    };

    const onPointerUp = () => {
      if (!latestPointer && !gesture) return;
      if (selectionFrame) {
        cancelAnimationFrame(selectionFrame);
        selectionFrame = 0;
      }
      const completed = gesture;
      gesture = null;
      latestPointer = null;
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      if (!completed) { hide(); return; }

      // Let Excalidraw finish its pointer-up scene update before applying the
      // final magnetic correction.
      finishFrame = requestAnimationFrame(() => {
        finishFrame = requestAnimationFrame(() => {
          finishFrame = 0;
          const currentApi = apiRef?.current;
          if (!currentApi) { hide(); return; }
          const elements = currentApi.getSceneElements?.() || [];
          const snapped = snapSceneElementsToSmartGuides(
            elements, completed.baseline, completed.selectedIds, 8,
          );
          if (snapped !== elements) {
            currentApi.updateScene?.({
              elements: snapped,
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
          hide();
        });
      });
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    // Bubble phase plus rAF deferral ensures Excalidraw has processed pointer-up.
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      cancelFrames();
      gesture = null;
      latestPointer = null;
      hide();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled]);

  if (!guides.length) return null;
  return (
    <svg className="sketchizi-alignment-guides"
      style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }}
      viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)}
      aria-hidden="true" focusable="false">
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
