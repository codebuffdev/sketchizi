import { useCallback, useState } from "react";
import { lineAngleDegrees, scenePxToCm } from "../../features/canvas/precisionGeometry.js";
import "./PrecisionToolbar.css";

const format = (value) => Number(value).toFixed(2);
const tools = [{ id: "ruler", label: "Ruler" }, { id: "protractor", label: "Protractor" }];

export default function PrecisionToolbar({ apiRef, canEdit, viewModeEnabled }) {
  const [mode, setMode] = useState(null);
  const [points, setPoints] = useState([]);
  const [result, setResult] = useState("");
  const reset = useCallback((nextMode = null) => {
    setMode(nextMode);
    setPoints([]);
    setResult("");
  }, []);
  const capturePoint = (event) => {
    if (event.button !== 0) return;
    const state = apiRef?.current?.getAppState?.();
    if (!state) return;
    const zoom = state.zoom?.value ?? state.zoom ?? 1;
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    const point = {
      x: (event.clientX - (state.offsetLeft ?? 0)) / zoom - (state.scrollX ?? 0),
      y: (event.clientY - (state.offsetTop ?? 0)) / zoom - (state.scrollY ?? 0),
    };
    const next = [...points, point];
    const count = mode === "ruler" ? 2 : 3;
    if (next.length < count) {
      setPoints(next);
      return;
    }
    if (mode === "ruler") {
      setResult(`Distance: ${format(scenePxToCm(Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y)))} cm`);
    } else {
      const a = lineAngleDegrees(next[1], next[0]);
      const b = lineAngleDegrees(next[1], next[2]);
      const difference = Math.abs(a - b);
      setResult(`Angle: ${format(Math.min(difference, 360 - difference))}°`);
    }
    setPoints([]);
  };
  if (!canEdit || viewModeEnabled) return null;
  return (
    <>
      <section className="sk-precision-toolbar" aria-label="Precision drawing tools">
        <strong>Precision</strong>
        {tools.map((tool) => (
          <button key={tool.id} type="button" aria-pressed={mode === tool.id}
            onClick={() => reset(mode === tool.id ? null : tool.id)}>{tool.label}</button>
        ))}
        {mode && <button type="button" onClick={() => reset(null)} aria-label="Exit precision tool">✕</button>}
        {mode && <span role="status">{result || (mode === "ruler"
          ? `Choose point ${points.length + 1} of 2`
          : `Choose point ${points.length + 1} of 3 (vertex second)`)}</span>}
      </section>
      {mode && <div className="sk-precision-hit-area" role="button" tabIndex={0}
        aria-label={mode === "ruler" ? "Select two points to measure distance" : "Select three points to measure angle"}
        onPointerDown={capturePoint}
        onKeyDown={(event) => { if (event.key === "Escape") reset(null); }} />}
    </>
  );
}
