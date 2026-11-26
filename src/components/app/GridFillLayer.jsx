import { useEffect, useRef } from "react";
import { getGridFill, paintGridFills } from "../../features/canvas/gridFill.js";

/**
 * Paints grid fills (see features/canvas/gridFill.js) on a canvas laid over
 * the Excalidraw viewport. Non-interactive; repaints on scene change, pan,
 * zoom and drag. Text and opaque shapes above a grid shape are knocked out.
 */
export default function GridFillLayer({ apiRef, canvasRootRef, canvasRevision = 0 }) {
  const canvasRef = useRef(null);
  const paintRef = useRef(() => {});

  paintRef.current = () => {
    const canvas = canvasRef.current;
    const api = apiRef?.current;
    const root = canvasRootRef?.current;
    if (!canvas || !api || !root) return;
    const elements = api.getSceneElements?.() || [];
    const ctx = canvas.getContext("2d");
    const viewport = root.querySelector(".excalidraw") || root;
    const rect = viewport.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.left = `${rect.left - rootRect.left}px`;
    canvas.style.top = `${rect.top - rootRect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!elements.some((el) => !el.isDeleted && getGridFill(el))) return;
    const appState = api.getAppState?.() || {};
    const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
    // Same mapping as sceneToCanvasPixel: (scene + scroll) * zoom.
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * (Number(appState.scrollX) || 0), dpr * zoom * (Number(appState.scrollY) || 0));
    paintGridFills(ctx, elements);
    canvas.style.filter = appState.theme === "dark" ? "invert(93%) hue-rotate(180deg)" : "none";
  };

  useEffect(() => {
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paintRef.current(); }); };
    const events = ["pointermove", "pointerup", "wheel", "keydown", "keyup", "resize"];
    events.forEach((name) => window.addEventListener(name, schedule, { passive: true }));
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      events.forEach((name) => window.removeEventListener(name, schedule));
    };
  }, []);
  useEffect(() => { paintRef.current(); }, [canvasRevision]);

  return <canvas ref={canvasRef} className="sketchizi-grid-fill-layer" aria-hidden="true" />;
}
