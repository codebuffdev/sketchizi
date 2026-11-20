import { useMemo } from "react";
import { formatCanvasStartDate, isValidCanvasStartDate } from "../../features/canvas/canvasStartDate.js";
import "./CanvasStartDate.css";

export default function CanvasStartDate({ value, onChange, disabled = false }) {
  const dateValue = isValidCanvasStartDate(value) ? value : "";
  const label = useMemo(() => formatCanvasStartDate(dateValue), [dateValue]);

  return (
    <div className="canvas-start-date" title={disabled ? `Canvas started ${label}` : "Change canvas start date"}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.25" y="3.5" width="11.5" height="10" rx="1.7" />
        <path d="M5 2v3M11 2v3M2.5 6.5h11" />
      </svg>
      <span>{label}</span>
      {!disabled && <input type="date" aria-label="Canvas start date" value={dateValue} onChange={(event) => onChange?.(event.target.value)} />}
    </div>
  );
}
