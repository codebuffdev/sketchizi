import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export function useMinimapController({ apiRef, minimapOpen }) {
  const minimapFrameRef = useRef(null);
  const minimapElementsRef = useRef([]);
  const [minimapScene, setMinimapScene] = useState({ elements: [], viewport: null });

  const updateMinimap = useCallback((elements, appState) => {
    minimapElementsRef.current = elements;
    if (!minimapOpen || minimapFrameRef.current) return;
    minimapFrameRef.current = requestAnimationFrame(() => {
      minimapFrameRef.current = null;
      const scene = minimapElementsRef.current.filter((element) => !element.isDeleted && element.width > 0 && element.height > 0);
      if (!scene.length) { setMinimapScene({ elements: [], viewport: null }); return; }
      const bounds = scene.reduce((acc, element) => ({ minX: Math.min(acc.minX, element.x), minY: Math.min(acc.minY, element.y), maxX: Math.max(acc.maxX, element.x + element.width), maxY: Math.max(acc.maxY, element.y + element.height) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      const simplified = scene.length > 1500 ? scene.filter((element, index) => element.width * element.height >= 1600 || index % Math.ceil(scene.length / 1500) === 0) : scene;
      const zoom = appState.zoom?.value || 1;
      const rect = document.querySelector(".excalidraw")?.getBoundingClientRect();
      const viewport = rect ? { x: -(appState.scrollX || 0), y: -(appState.scrollY || 0), width: rect.width / zoom, height: rect.height / zoom } : null;
      const selectedIds = appState.selectedElementIds || {};
      setMinimapScene({ elements: simplified.map((element) => ({ ...element, isSelected: !!selectedIds[element.id] })), bounds, viewport, sceneCount: scene.length });
    });
  }, [minimapOpen]);

  useEffect(() => {
    if (!minimapOpen || !apiRef.current) return;
    const api = apiRef.current;
    updateMinimap(api.getSceneElements(), api.getAppState());
  }, [apiRef, minimapOpen, updateMinimap]);

  const centerOnMinimap = useCallback((sceneX, sceneY) => {
    const api = apiRef.current; if (!api) return;
    const appState = api.getAppState(); const zoom = appState.zoom?.value || 1;
    const rect = document.querySelector(".excalidraw")?.getBoundingClientRect(); if (!rect) return;
    api.updateScene({ appState: { ...appState, scrollX: -(sceneX - rect.width / zoom / 2), scrollY: -(sceneY - rect.height / zoom / 2) }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef]);

  return { minimapFrameRef, minimapElementsRef, minimapScene, updateMinimap, centerOnMinimap };
}
