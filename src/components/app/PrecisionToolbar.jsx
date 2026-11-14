import { useCallback, useState } from "react";
import { cmToScenePx, lineAngleDegrees, scenePxToCm } from "../../features/canvas/precisionGeometry.js";
import "./PrecisionToolbar.css";

const format = (value) => Number(value).toFixed(2);
const tools = [{ id: "ruler", label: "Ruler" }, { id: "protractor", label: "Protractor" }, { id: "compass", label: "Compass" }];

export default function PrecisionToolbar({ apiRef, canEdit, viewModeEnabled, selectedElements = [] }) {
  const [mode, setMode] = useState(null);
  const [points, setPoints] = useState([]);
  const [result, setResult] = useState("");
  const [radiusCm, setRadiusCm] = useState("2.5");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const reset = useCallback((nextMode = null) => {
    setMode(nextMode);
    setPoints([]);
    setResult("");
  }, []);
  const editableShape = selectedElements.length === 1 && ["rectangle", "ellipse", "diamond"].includes(selectedElements[0]?.type)
    ? selectedElements[0] : null;
  const setExactDimensions = () => {
    if (!editableShape) return;
    const width = cmToScenePx(widthCm);
    const height = cmToScenePx(heightCm);
    if (width === null || height === null || width <= 0 || height <= 0) {
      setResult("Enter positive width and height in cm");
      return;
    }
    const api = apiRef?.current;
    if (!api?.updateScene || !api?.getSceneElements) return;
    api.updateScene({ elements: api.getSceneElements().map((element) =>
      element.id === editableShape.id ? { ...element, width, height, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() } : element
    ) });
    setResult(`Dimensions set: ${format(widthCm)} × ${format(heightCm)} cm`);
  };
  const createCircle = (center) => {
    const radius = cmToScenePx(radiusCm);
    if (radius === null || radius <= 0) { setResult("Enter a positive radius in cm"); return; }
    const api = apiRef?.current;
    if (!api?.updateScene || !api?.getSceneElements) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `precision-${Date.now()}`;
    const state = api.getAppState?.() || {};
    const ellipse = {
      id, type: "ellipse", x: center.x - radius, y: center.y - radius,
      width: radius * 2, height: radius * 2, angle: 0,
      strokeColor: state.currentItemStrokeColor || "#1e1e1e",
      backgroundColor: state.currentItemBackgroundColor || "transparent",
      fillStyle: state.currentItemFillStyle || "solid",
      strokeWidth: state.currentItemStrokeWidth || 2,
      strokeStyle: state.currentItemStrokeStyle || "solid",
      roughness: state.currentItemRoughness ?? 1,
      opacity: state.currentItemOpacity ?? 100,
      groupIds: [], frameId: null, roundness: null,
      seed: Math.floor(Math.random() * 2147483647), version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
    };
    api.updateScene({ elements: [...api.getSceneElements(), ellipse] });
    setResult(`Circle created: r = ${format(radiusCm)} cm`);
  };
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
    if (mode === "compass") { createCircle(point); return; }
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
        {mode === "compass" && <label>Radius (cm) <input aria-label="Circle radius in centimeters" type="number" min="0.01" step="0.1" value={radiusCm} onChange={(event) => setRadiusCm(event.target.value)} /></label>}
        {editableShape && <label>Width (cm) <input aria-label="Exact width in centimeters" type="number" min="0.01" step="0.1" value={widthCm} onChange={(event) => setWidthCm(event.target.value)} /></label>}
        {editableShape && <label>Height (cm) <input aria-label="Exact height in centimeters" type="number" min="0.01" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} /></label>}
        {editableShape && <button type="button" onClick={setExactDimensions}>Apply size</button>}
        {mode && <button type="button" onClick={() => reset(null)} aria-label="Exit precision tool">✕</button>}
        {mode && <span role="status">{result || (mode === "compass" ? "Click canvas to place circle center" : mode === "ruler"
          ? `Choose point ${points.length + 1} of 2`
          : `Choose point ${points.length + 1} of 3 (vertex second)`)}</span>}
      </section>
      {mode && <div className="sk-precision-hit-area" role="button" tabIndex={0}
        aria-label={mode === "compass" ? "Select circle center" : mode === "ruler" ? "Select two points to measure distance" : "Select three points to measure angle"}
        onPointerDown={capturePoint}
        onKeyDown={(event) => { if (event.key === "Escape") reset(null); }} />}
    </>
  );
}
