import { useEffect, useState } from "react";

const HANDLES = [["nw", 0, 0], ["ne", 1, 0], ["sw", 0, 1], ["se", 1, 1]];

/**
 * Visual-only selection frame for a single selected element (#6366F1, 1.5px),
 * with 4 square corner handles and a top rotation circle. Drag, resize and
 * rotate gestures are still handled by the canvas itself (pointer capture and
 * arrow-key nudging); this layer never takes pointer events. The font-size
 * pill under the frame is rendered by TextSizeIndicator.
 */
export default function SelectionFrame({ apiRef, canvasRootRef, canvasRevision = 0, viewModeEnabled }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let frame = 0;
    const bump = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; setTick((t) => (t + 1) % 1000); }); };
    // Re-check on every gesture that can start or end text editing so the frame never lingers.
    const extra = ["pointerdown", "pointerup", "dblclick", "focusin", "focusout"];
    extra.forEach((name) => window.addEventListener(name, bump, true));
    window.addEventListener("pointermove", bump, { passive: true });
    window.addEventListener("wheel", bump, { passive: true });
    window.addEventListener("keydown", bump);
    window.addEventListener("resize", bump);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      extra.forEach((name) => window.removeEventListener(name, bump, true));
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("wheel", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("resize", bump);
    };
  }, []);

  void canvasRevision;
  const api = apiRef?.current;
  const root = canvasRootRef?.current;
  if (!api || !root || viewModeEnabled) return null;
  const appState = api.getAppState?.() || {};
  const ids = Object.entries(appState.selectedElementIds || {}).filter(([, on]) => on).map(([id]) => id);
  // While a text element is edited the editor owns the single focus outline.
  if (ids.length !== 1 || appState.editingTextElement || root.querySelector(".sketchizi-runs-editor")) return null;
  const element = (api.getSceneElements?.() || []).find((el) => el.id === ids[0]);
  if (!element || element.isDeleted || element.type === "line" || element.type === "arrow" || element.type === "freedraw") return null;
  const viewport = root.querySelector(".excalidraw") || root;
  const rootRect = root.getBoundingClientRect();
  const vr = viewport.getBoundingClientRect();
  const zoom = Math.max(0.01, Number(appState.zoom?.value ?? appState.zoom) || 1);
  const left = (element.x + (Number(appState.scrollX) || 0)) * zoom + (vr.left - rootRect.left);
  const top = (element.y + (Number(appState.scrollY) || 0)) * zoom + (vr.top - rootRect.top);
  const style = {
    left, top, width: Math.max(1, element.width * zoom), height: Math.max(1, element.height * zoom),
    transform: element.angle ? `rotate(${element.angle}rad)` : undefined,
  };
  return (
    <div className="sketchizi-selection-frame-layer" aria-hidden="true">
      <div className="sketchizi-selection-frame" data-selection-frame="true" style={style}>
        {HANDLES.map(([key, fx, fy]) => (
          <span key={key} className="sk-handle" style={{ left: fx ? "100%" : 0, top: fy ? "100%" : 0, transform: "translate(-50%, -50%)" }} />
        ))}
        <span className="sk-rotate" />
      </div>
    </div>
  );
}
