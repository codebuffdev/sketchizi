import React, { useState, useEffect, useRef, useMemo } from "react";

export default function CanvasMiniMap({ apiRef, canvasRootRef, isDarkTheme = true }) {
  const [collapsed, setCollapsed] = useState(false);
  const [, setTick] = useState(0);

  // Smoothly sync on drag, pan, zoom, and window resize
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

    window.addEventListener("pointermove", schedule, { passive: true });
    window.addEventListener("wheel", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const interval = setInterval(schedule, 400);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearInterval(interval);
      window.removeEventListener("pointermove", schedule);
      window.removeEventListener("wheel", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [canvasRootRef]);

  const mapData = useMemo(() => {
    const api = apiRef?.current;
    const root = canvasRootRef?.current;
    if (!api || !root) return null;

    const appState = api.getAppState?.() || {};
    const sceneElements = api.getSceneElements?.() || [];
    const elements = sceneElements.filter((el) => el && !el.isDeleted && !el.deleted);

    if (elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of elements) {
      const x = Number(el.x) || 0;
      const y = Number(el.y) || 0;
      const w = Number(el.width) || 0;
      const h = Number(el.height) || 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    // Add margin around scene elements
    const margin = 120;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;

    const sceneWidth = Math.max(200, maxX - minX);
    const sceneHeight = Math.max(150, maxY - minY);

    const zoom = Math.max(0.01, Number(appState.zoom?.value ?? appState.zoom) || 1);
    const scrollX = Number(appState.scrollX) || 0;
    const scrollY = Number(appState.scrollY) || 0;

    const rootRect = root.getBoundingClientRect();
    const vpW = rootRect.width / zoom;
    const vpH = rootRect.height / zoom;
    const vpX = -scrollX;
    const vpY = -scrollY;

    // MiniMap viewport dimensions
    const mapWidth = 180;
    const mapHeight = 110;
    const scale = Math.min(mapWidth / sceneWidth, mapHeight / sceneHeight);

    const vpRectInMap = {
      x: (vpX - minX) * scale,
      y: (vpY - minY) * scale,
      w: Math.max(12, vpW * scale),
      h: Math.max(8, vpH * scale),
    };

    return {
      minX,
      minY,
      scale,
      mapWidth,
      mapHeight,
      vpRectInMap,
      elements: elements.slice(0, 80).map((el) => ({
        id: el.id,
        type: el.type,
        x: (el.x - minX) * scale,
        y: (el.y - minY) * scale,
        w: Math.max(2, (Number(el.width) || 10) * scale),
        h: Math.max(2, (Number(el.height) || 10) * scale),
        stroke: el.strokeColor || "#64748b",
        fill: el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : "rgba(100, 116, 139, 0.2)",
      })),
      onMapClick: (e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const targetSceneX = minX + clickX / scale;
        const targetSceneY = minY + clickY / scale;

        const newScrollX = -(targetSceneX - vpW / 2);
        const newScrollY = -(targetSceneY - vpH / 2);

        api.updateScene?.({
          appState: {
            scrollX: newScrollX,
            scrollY: newScrollY,
          },
        });
      },
    };
  }, [apiRef, canvasRootRef]);

  if (!mapData) return null;

  return (
    <div
      className={`sketchizi-minimap-root ${collapsed ? "is-collapsed" : ""}`}
      role="region"
      aria-label="Canvas Mini-Map"
    >
      <div className="sketchizi-minimap-header">
        <span className="sketchizi-minimap-title">Navigator</span>
        <button
          type="button"
          className="sketchizi-minimap-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand Mini-Map" : "Minimize Mini-Map"}
          aria-label={collapsed ? "Expand Mini-Map" : "Minimize Mini-Map"}
        >
          {collapsed ? "⛶" : "−"}
        </button>
      </div>

      {!collapsed && (
        <svg
          className="sketchizi-minimap-canvas"
          width={mapData.mapWidth}
          height={mapData.mapHeight}
          onClick={mapData.onMapClick}
          title="Click to pan canvas"
        >
          <rect width="100%" height="100%" className="sketchizi-minimap-bg" />
          {mapData.elements.map((el) => (
            <rect
              key={el.id}
              x={el.x}
              y={el.y}
              width={el.w}
              height={el.h}
              fill={el.fill}
              stroke={el.stroke}
              strokeWidth="0.8"
              rx="1.5"
            />
          ))}
          <rect
            className="sketchizi-minimap-viewport"
            x={mapData.vpRectInMap.x}
            y={mapData.vpRectInMap.y}
            width={mapData.vpRectInMap.w}
            height={mapData.vpRectInMap.h}
            rx="2"
          />
        </svg>
      )}
    </div>
  );
}
