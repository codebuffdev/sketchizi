import { useEffect, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { calculateAlignmentGuides } from "../../features/canvas/alignmentGuides.js";
import { calculateEqualSpacingGuides, snapSceneElementsToSmartGuides } from "../../features/canvas/smartSnapping.js";

const EMPTY_GUIDES = [];

function getSelectedIds(pointerDownState, appState) {
  const ids = new Set(pointerDownState?.originalElements instanceof Map
    ? [...pointerDownState.originalElements.keys()]
    : []);
  if (!ids.size) {
    Object.entries(appState?.selectedElementIds || {}).forEach(([id, selected]) => {
      if (selected) ids.add(id);
    });
  }
  if (!ids.size && pointerDownState?.hit?.element?.id) {
    ids.add(pointerDownState.hit.element.id);
  }
  return ids;
}

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  const [overlay, setOverlay] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const root = canvasRootRef.current;
    const api = apiRef?.current;
    if (!root || !api || !canEdit || viewModeEnabled ||
        typeof api.onPointerDown !== "function" || typeof api.onPointerUp !== "function") {
      setGuides(EMPTY_GUIDES);
      return undefined;
    }

    let gesture = null;
    let frame = 0;
    let finishFrame = 0;
    let latestPointer = null;

    const hide = () => setGuides(EMPTY_GUIDES);
    const cancelFrames = () => {
      if (frame) cancelAnimationFrame(frame);
      if (finishFrame) cancelAnimationFrame(finishFrame);
      frame = 0;
      finishFrame = 0;
    };

    const renderGuides = () => {
      frame = 0;
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

      const toViewport = api.sceneCoordsToViewportCoords;
      if (typeof toViewport !== "function") { hide(); return; }
      const toLocal = (axis, position) => {
        const point = toViewport({
          sceneX: axis === "x" ? position : 0,
          sceneY: axis === "y" ? position : 0,
        });
        return axis === "x" ? point.x : point.y;
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
      if (!frame) frame = requestAnimationFrame(renderGuides);
    };

    // Subscribe to Excalidraw's own gesture lifecycle. Its pointer-down
    // callback runs after it has resolved the hit target and selection.
    const unsubscribeDown = api.onPointerDown((_tool, pointerDownState, event) => {
      cancelFrames();
      hide();
      const appState = api.getAppState?.() || {};
      const selectedIds = getSelectedIds(pointerDownState, appState);
      const elements = (api.getSceneElements?.() || []).filter((element) =>
        element && !element.isDeleted && !element.deleted);
      const selected = elements.filter((element) => selectedIds.has(element.id));
      if (!selected.length) {
        gesture = null;
        return;
      }
      gesture = {
        pointer: { x: event.clientX, y: event.clientY },
        selectedIds: new Set(selected.map((element) => element.id)),
        elements,
        baseline: new Map(elements.map((element) => [element.id, {
          x: element.x, y: element.y, width: element.width, height: element.height,
          angle: element.angle, type: element.type,
        }])),
      };
      latestPointer = gesture.pointer;
    });

    const onPointerMove = (event) => {
      if (!gesture) return;
      latestPointer = { x: event.clientX, y: event.clientY };
      scheduleRender();
    };

    const unsubscribeUp = api.onPointerUp(() => {
      if (!gesture) return;
      const completed = gesture;
      gesture = null;
      latestPointer = null;
      cancelFrames();
      // Excalidraw emits pointer-up before its final scene/history commit.
      // Defer our one final correction until that commit has completed.
      finishFrame = requestAnimationFrame(() => {
        finishFrame = requestAnimationFrame(() => {
          finishFrame = 0;
          const currentApi = apiRef?.current;
          if (!currentApi) { hide(); return; }
          const elements = currentApi.getSceneElements?.() || [];
          const appState = currentApi.getAppState?.() || {};
          const selectedNow = new Set(Object.entries(appState.selectedElementIds || {})
            .filter(([, selected]) => selected).map(([id]) => id));
          if ([...completed.selectedIds].some((id) => selectedNow.has(id))) {
            const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
            const snapped = snapSceneElementsToSmartGuides(
              elements, completed.baseline, completed.selectedIds, 8 / zoom,
            );
            if (snapped !== elements) {
              currentApi.updateScene?.({
                elements: snapped,
                captureUpdate: CaptureUpdateAction.IMMEDIATELY,
              });
            }
          }
          hide();
        });
      });
    });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      unsubscribeDown?.();
      unsubscribeUp?.();
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
