import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./prototype.css";

const initialData = {
  elements: [
    { id: "prototype-left", type: "rectangle", x: 280, y: 250, width: 180, height: 120, angle: 0, strokeColor: "#e5e7eb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false },
    { id: "prototype-right", type: "rectangle", x: 620, y: 250, width: 180, height: 120, angle: 0, strokeColor: "#e5e7eb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, seed: 2, version: 1, versionNonce: 2, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false },
  ],
  appState: { viewBackgroundColor: "#111719", currentItemStrokeColor: "#e5e7eb", currentItemBackgroundColor: "transparent", zoom: { value: 1 } },
};

function App() {
  const apiRef = useRef(null);
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [guides, setGuides] = useState([]);
  const [status, setStatus] = useState("Waiting for Excalidraw API…");
  const [eventLog, setEventLog] = useState([]);

  useEffect(() => {
    const api = apiRef.current;
    const root = rootRef.current;
    if (!api || !root) return;
    const log = (message) => setEventLog((items) => [message, ...items].slice(0, 6));
    const unsubscribeDown = api.onPointerDown((activeTool, pointerDownState, event) => {
      const appState = api.getAppState();
      const selected = Object.entries(appState.selectedElementIds || {}).filter(([, yes]) => yes).map(([id]) => id);
      const hit = pointerDownState?.hit?.element;
      const ids = selected.length ? selected : hit ? [hit.id] : [];
      const elements = api.getSceneElements().filter((el) => !el.isDeleted);
      gestureRef.current = ids.length ? {
        ids: new Set(ids),
        start: { x: event.clientX, y: event.clientY },
        elements,
        baseline: new Map(elements.map((el) => [el.id, { x: el.x, y: el.y, width: el.width, height: el.height }])),
      } : null;
      setGuides([]);
      setStatus("Pointer down subscription fired · " + (gestureRef.current ? "drag target captured" : "no target captured"));
      log("onPointerDown: " + (hit?.id || "no hit") + " · selected " + ids.length);
    });
    const unsubscribeUp = api.onPointerUp(() => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      setGuides([]);
      setStatus("Pointer up subscription fired · " + (gesture ? "gesture completed" : "no active drag"));
      log("onPointerUp: " + (gesture ? "captured gesture completed" : "no gesture"));
    });
    const onMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const appState = api.getAppState();
      const zoom = Math.max(0.1, appState.zoom?.value || 1);
      const dx = (event.clientX - gesture.start.x) / zoom;
      const dy = (event.clientY - gesture.start.y) / zoom;
      const moving = gesture.elements.filter((el) => gesture.ids.has(el.id));
      const stationary = gesture.elements.filter((el) => !gesture.ids.has(el.id));
      const result = [];
      for (const a of moving) {
        const ax = a.x + dx;
        const ay = a.y + dy;
        const edges = [
          ["x", ax, "left"], ["x", ax + a.width, "right"], ["x", ax + a.width / 2, "center"],
          ["y", ay, "top"], ["y", ay + a.height, "bottom"], ["y", ay + a.height / 2, "center"],
        ];
        for (const b of stationary) {
          const overlapX = Math.min(ay + a.height, b.y + b.height) - Math.max(ay, b.y);
          const overlapY = Math.min(ax + a.width, b.x + b.width) - Math.max(ax, b.x);
          for (const [axis, position] of edges) {
            if ((axis === "x" && overlapX < 0) || (axis === "y" && overlapY < 0)) continue;
            const targets = axis === "x" ? [b.x, b.x + b.width, b.x + b.width / 2] : [b.y, b.y + b.height, b.y + b.height / 2];
            const match = targets.find((target) => Math.abs(position - target) <= 8 / zoom);
            if (match !== undefined) result.push({ axis, position: match });
          }
        }
      }
      const viewport = root.querySelector(".excalidraw");
      const rect = viewport?.getBoundingClientRect();
      if (!rect) return;
      const offset = axis => axis === "x" ? (appState.scrollX || 0) : (appState.scrollY || 0);
      const screen = result.slice(0, 4).map((g, i) => ({
        id: i,
        x: g.axis === "x" ? (g.position + offset("x")) * zoom + rect.width / 2 : null,
        y: g.axis === "y" ? (g.position + offset("y")) * zoom + rect.height / 2 : null,
        axis: g.axis,
      }));
      setGuides(screen);
      if (screen.length) setStatus("Live alignment match · " + screen.length + " guide(s)");
    };
    window.addEventListener("pointermove", onMove, true);
    setStatus("Excalidraw API ready · pointer subscriptions attached");
    log("API ready: onPointerDown=" + typeof api.onPointerDown + ", onPointerUp=" + typeof api.onPointerUp);
    return () => {
      unsubscribeDown?.();
      unsubscribeUp?.();
      window.removeEventListener("pointermove", onMove, true);
    };
  }, [apiRef.current]);

  return <div className="prototype-shell" ref={rootRef}>
    <header><strong>Smart Guides · Isolated Prototype</strong><span>{status}</span></header>
    <aside>
      <strong>Interaction diagnostics</strong>
      <p>Drag either rectangle toward the other. This prototype isolates Excalidraw pointer subscriptions from Sketchizi's canvas integration.</p>
      <div className="log">{eventLog.map((line, i) => <div key={i}>{line}</div>)}</div>
      <button onClick={() => { apiRef.current?.resetScene(); setGuides([]); }}>Reset scene</button>
    </aside>
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={(api) => { apiRef.current = api; setStatus("Excalidraw API mounted"); }}
      onExcalidrawAPI={(api) => { if (api) { apiRef.current = api; setStatus("Excalidraw API mounted"); } }}
      theme="dark"
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
    />
    <svg className="prototype-guides" aria-hidden="true">
      {guides.map((guide) => guide.axis === "x"
        ? <line key={guide.id} x1={guide.x} x2={guide.x} y1="0" y2="100%" />
        : <line key={guide.id} x1="0" x2="100%" y1={guide.y} y2={guide.y} />)}
    </svg>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
