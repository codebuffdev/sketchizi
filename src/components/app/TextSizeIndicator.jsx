import { useEffect, useState, useMemo } from "react";

export default function TextSizeIndicator({
  apiRef,
  canvasRootRef,
  selectedElements = [],
  canvasRevision = 0,
}) {
  const [, setTick] = useState(0);

  // Re-render smoothly while user is dragging, resizing, or panning
  useEffect(() => {
    const root = canvasRootRef?.current;
    if (!root) return undefined;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTick((t) => (t + 1) % 1000);
      });
    };

    const handlePointerMove = () => schedule();
    const handleWheel = () => schedule();

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", schedule);
    };
  }, [canvasRootRef]);

  const indicators = useMemo(() => {
    const api = apiRef?.current;
    const root = canvasRootRef?.current;
    if (!api || !root) return [];

    const appState = api.getAppState?.() || {};
    const sceneElements = api.getSceneElements?.() || [];
    const zoom = Math.max(0.01, Number(appState.zoom?.value ?? appState.zoom) || 1);

    // Identify selected element IDs from appState or selectedElements prop
    const selectedIds = new Set(
      Object.entries(appState.selectedElementIds || {})
        .filter(([, isSelected]) => isSelected)
        .map(([id]) => id)
    );
    if (selectedIds.size === 0 && Array.isArray(selectedElements)) {
      for (const el of selectedElements) {
        if (el?.id) selectedIds.add(el.id);
      }
    }

    if (selectedIds.size === 0) return [];

    // Find all text elements in the selection
    const textElements = [];
    const byId = new Map(sceneElements.map((el) => [el.id, el]));

    for (const id of selectedIds) {
      const el = byId.get(id);
      if (!el || el.isDeleted || el.deleted) continue;

      if (el.type === "text") {
        textElements.push(el);
      } else if (Array.isArray(el.boundElements)) {
        for (const bound of el.boundElements) {
          if (bound?.type === "text" && bound.id) {
            const boundEl = byId.get(bound.id);
            if (boundEl && !boundEl.isDeleted) {
              textElements.push(boundEl);
            }
          }
        }
      }
    }

    if (textElements.length === 0) return [];

    const viewport = root.querySelector(".excalidraw") || root;
    const rootRect = root.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const offsetX = viewportRect.left - rootRect.left;
    const offsetY = viewportRect.top - rootRect.top;

    const sceneCoordsToViewportCoords = api.sceneCoordsToViewportCoords;

    return textElements.map((element) => {
      const fontSize = Number(element.fontSize) || 20;
      const x = Number(element.x) || 0;
      const y = Number(element.y) || 0;
      const width = Number(element.width) || 0;
      const height = Number(element.height) || 0;

      // Bottom center of the text element bounding box
      const bottomCenterX = x + width / 2;
      const bottomY = y + height;

      let screenX = 0;
      let screenY = 0;

      if (typeof sceneCoordsToViewportCoords === "function") {
        const pt = sceneCoordsToViewportCoords({
          sceneX: bottomCenterX,
          sceneY: bottomY,
        });
        screenX = pt.x + offsetX;
        screenY = pt.y + offsetY;
      } else {
        const scrollX = Number(appState.scrollX) || 0;
        const scrollY = Number(appState.scrollY) || 0;
        screenX = (bottomCenterX + scrollX) * zoom + offsetX;
        screenY = (bottomY + scrollY) * zoom + offsetY;
      }

      return {
        id: element.id,
        fontSize: Math.round(fontSize),
        left: screenX,
        top: screenY + 8, // slight offset beneath the bottom selection handle
        width: Math.round(width),
        height: Math.round(height),
      };
    });
  }, [apiRef, canvasRootRef, selectedElements, canvasRevision]);

  if (indicators.length === 0) return null;

  return (
    <div className="sketchizi-text-size-layer" aria-hidden="true">
      {indicators.map((ind) => (
        <div
          key={ind.id}
          className="sketchizi-text-size-indicator"
          style={{
            left: `${ind.left}px`,
            top: `${ind.top}px`,
          }}
          title={`Font size: ${ind.fontSize}px (${ind.width} × ${ind.height} px)`}
        >
          {ind.fontSize}px
        </div>
      ))}
    </div>
  );
}
