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

const anchors = (start, size) => [start, start + size / 2, start + size];
function nearestAlignment(moving, stationary, axis, tolerance) {
  let best = null;
  for (const a of moving) {
    const ax = a.x;
    const ay = a.y;
    for (const b of stationary) {
      const overlap = axis === "x"
        ? Math.min(ay + a.height, b.y + b.height) - Math.max(ay, b.y)
        : Math.min(ax + a.width, b.x + b.width) - Math.max(ax, b.x);
      if (overlap < 0) continue;
      const movingAnchors = anchors(axis === "x" ? a.x : a.y, axis === "x" ? a.width : a.height);
      const targetAnchors = anchors(axis === "x" ? b.x : b.y, axis === "x" ? b.width : b.height);
      for (const from of movingAnchors) for (const to of targetAnchors) {
        const delta = to - from;
        if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, position: to };
        }
      }
    }
  }
  return best;
}

function App() {
  const apiRef = useRef(null);
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
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
      setStatus("Pointer down · " + (gestureRef.current ? "drag captured" : "no drag target"));
      log("pointer down · selected " + ids.length);
    });
    const unsubscribeUp = api.onPointerUp(() => {
      const hadGesture = Boolean(gestureRef.current);
      gestureRef.current = null;
      setGuides([]);
      setStatus("Pointer up · " + (hadGesture ? "drag completed" : "no active drag"));
      log("pointer up · drag " + (hadGesture ? "completed" : "not captured"));
    });

    const onMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const appState = api.getAppState();
      const zoom = Math.max(0.1, appState.zoom?.value || 1);
      const dx = (event.clientX - gesture.start.x) / zoom;
      const dy = (event.clientY - gesture.start.y) / zoom;
      const moving = gesture.elements.filter((el) => gesture.ids.has(el.id)).map((el) => {
        const base = gesture.baseline.get(el.id);
        return { ...el, x: base.x + dx, y: base.y + dy, width: base.width, height: base.height };
      });
      const stationary = gesture.elements.filter((el) => !gesture.ids.has(el.id));
      const snapX = nearestAlignment(moving, stationary, "x", 8 / zoom);
      const snapY = nearestAlignment(moving, stationary, "y", 8 / zoom);
      const correctionX = snapX?.delta || 0;
      const correctionY = snapY?.delta || 0;

      // Apply the correction to the actual scene elements, not just the guide overlay.
      if (correctionX || correctionY) {
        const current = api.getSceneElements();
        const corrected = current.map((el) => {
          if (!gesture.ids.has(el.id)) return el;
          const base = gesture.baseline.get(el.id);
          return { ...el, x: base.x + dx + correctionX, y: base.y + dy + correctionY };
        });
        api.updateScene({ elements: corrected });
      }

      const viewport = root.querySelector(".excalidraw");
      const rect = viewport?.getBoundingClientRect();
      if (!rect) return;
      const toScreenX = (position) => (position + (Number(appState.scrollX) || 0)) * zoom + (Number(appState.offsetLeft) || rect.left) - rect.left;
      const toScreenY = (position) => (position + (Number(appState.scrollY) || 0)) * zoom + (Number(appState.offsetTop) || rect.top) - rect.top;
      const nextGuides = [];
      if (snapX) nextGuides.push({ id: "x", axis: "x", position: toScreenX(snapX.position) });
      if (snapY) nextGuides.push({ id: "y", axis: "y", position: toScreenY(snapY.position) });
      setGuides(nextGuides);
      setStatus(nextGuides.length
        ? "Magnetic snap active · " + nextGuides.length + " axis"
        : "Dragging · no snap within tolerance");
    };

    window.addEventListener("pointermove", onMove, true);
    setStatus("Excalidraw API ready · magnetic correction enabled");
    log("API ready · pointer subscriptions attached");
    return () => {
      unsubscribeDown?.();
      unsubscribeUp?.();
      window.removeEventListener("pointermove", onMove, true);
    };
  }, [apiReady]);

  return <div className="prototype-shell" ref={rootRef}>
    <header><strong>Smart Guides · Magnetic Snap Prototype</strong><span>{status}</span></header>
    <aside>
      <strong>Interaction diagnostics</strong>
      <p>Drag either rectangle toward the other. Within 8 screen pixels, matching edges or centers should pull into alignment on both axes.</p>
      <div className="log">{eventLog.map((line, i) => <div key={i}>{line}</div>)}</div>
      <button onClick={() => { apiRef.current?.resetScene(); setGuides([]); }}>Reset scene</button>
    </aside>
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={(api) => { apiRef.current = api; setApiReady(true); setStatus("Excalidraw API mounted"); }}
      onExcalidrawAPI={(api) => { if (api) { apiRef.current = api; setApiReady(true); setStatus("Excalidraw API mounted"); } }}
      theme="dark"
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
    />
    <svg className="prototype-guides" aria-hidden="true">
      {guides.map((guide) => guide.axis === "x"
        ? <line key={guide.id} x1={guide.position} x2={guide.position} y1="0" y2="100%" />
        : <line key={guide.id} x1="0" x2="100%" y1={guide.position} y2={guide.position} />)}
    </svg>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
