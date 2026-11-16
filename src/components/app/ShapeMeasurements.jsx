import { useMemo } from "react";
import { createPortal } from "react-dom";
import "./ShapeMeasurements.css";


const CM_PER_CSS_PX = 2.54 / 96;
const formatCm = (value) => `${(Math.abs(value) * CM_PER_CSS_PX).toFixed(2)} cm`;

// Measurements use scene coordinates; zoom and scroll only position the labels.
export function getSelectedShapeBounds(elements) {
  const shapes = (elements || []).filter((element) =>
    element && !element.isDeleted && !element.deleted &&
    !["text", "image", "freedraw", "arrow", "line"].includes(element.type) &&
    Number.isFinite(element.x) && Number.isFinite(element.y) &&
    Number.isFinite(element.width) && Number.isFinite(element.height));
  if (shapes.length !== 1) return null;
  const shape = shapes[0];
  const width = Math.abs(shape.width);
  const height = Math.abs(shape.height);
  if (width < 1 || height < 1) return null;
  const left = shape.x + Math.min(0, shape.width);
  const top = shape.y + Math.min(0, shape.height);
  return { left, top, width, height, angle: shape.angle || 0, type: shape.type };
}

export default function ShapeMeasurements({ apiRef, selectedElements, canvasRevision, viewModeEnabled, canvasRootRef, isDarkTheme }) {
  const bounds = useMemo(() => getSelectedShapeBounds(selectedElements), [selectedElements, canvasRevision]);
  if (viewModeEnabled || !bounds || Math.abs(bounds.angle) > 0.001) return null;
  const state = apiRef?.current?.getAppState?.();
  if (!state) return null;
  const zoom = typeof state.zoom === "number" ? state.zoom : state.zoom?.value ?? 1;
  const scrollX = state.scrollX ?? 0;
  const scrollY = state.scrollY ?? 0;
  const offsetLeft = state.offsetLeft ?? 0;
  const offsetTop = state.offsetTop ?? 0;
  const rootRect = canvasRootRef?.current?.getBoundingClientRect?.();
  if (!rootRect) return null;
  const x = (bounds.left + scrollX) * zoom + offsetLeft;
  const y = (bounds.top + scrollY) * zoom + offsetTop;
  const width = bounds.width * zoom;
  const height = bounds.height * zoom;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  const isEllipse = bounds.type === "ellipse";
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  // A true circle has one radius; an ellipse has two semi-axes.
  const isCircle = isEllipse && Math.abs(bounds.width - bounds.height) <= 0.01 * Math.max(bounds.width, bounds.height);
  return createPortal(
    <div className="sk-shape-measurements" aria-hidden="true" style={{ "--sk-measure-canvas-bg": isDarkTheme ? "#12181c" : "#ffffff" }}>
      {isEllipse ? (
        <>
          <svg className="sk-shape-radius-guide" style={{ left: x, top: y, width, height }}
            viewBox={`0 0 ${bounds.width} ${bounds.height}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1={radiusX} y1={radiusY} x2={bounds.width} y2={radiusY} />
            {!isCircle && <line x1={radiusX} y1={radiusY} x2={radiusX} y2="0" />}
            <circle cx={radiusX} cy={radiusY} r={Math.min(3 / zoom, 4)} />
          </svg>
          <span className="sk-shape-measurement sk-shape-radius-label"
            style={{ left: x + width * 0.75, top: y + height / 2 - 17 }}>
            {isCircle ? `r = ${formatCm(radiusX)}` : `rx = ${formatCm(radiusX)}`}
          </span>
          {!isCircle && <span className="sk-shape-measurement sk-shape-radius-label"
            style={{ left: x + width / 2 + 20, top: y + height / 4 }}>
            {`ry = ${formatCm(radiusY)}`}
          </span>}
        </>
      ) : (
        <>
          <span className="sk-shape-measurement-width-mask" style={{ left: x + width / 2, top: y + height + 21 }}>
            <span className="sk-shape-measurement sk-shape-measurement-width">{formatCm(bounds.width)}</span>
          </span>
          <span className="sk-shape-measurement sk-shape-measurement-height"
            style={{ left: x + width + 13, top: y + height / 2 }}>{formatCm(bounds.height)}</span>
        </>
      )}
    </div>,
    document.body
  );
}
