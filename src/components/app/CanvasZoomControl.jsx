import { useEffect, useState } from "react";

// Header zoom pill: shows the live percentage and resets the viewport to 100%
// in one click. It runs the existing view.reset-zoom command, so behaviour
// matches Ctrl+0 and the View menu. Zoom in/out shortcuts and wheel/pinch zoom
// are handled elsewhere and are untouched.
function readZoomPercent(api) {
  const value = Number(api?.getAppState?.()?.zoom?.value);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 100;
}

export default function CanvasZoomControl({ api, onReset }) {
  const [percent, setPercent] = useState(() => readZoomPercent(api));

  useEffect(() => {
    setPercent(readZoomPercent(api));
    if (!api?.onChange) return undefined;
    const unsubscribe = api.onChange((_elements, appState) => {
      const value = Number(appState?.zoom?.value);
      if (Number.isFinite(value) && value > 0) {
        const next = Math.round(value * 100);
        setPercent((current) => (current === next ? current : next));
      }
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [api]);

  return (
    <div className="desktop-app-zoom-wrap">
      <button
        type="button"
        className="desktop-app-zoom-control"
        aria-label="Reset zoom to 100%"
        title="Reset zoom to 100% (Ctrl+0)"
        onClick={() => onReset?.()}
      >
        {percent}%
      </button>
    </div>
  );
}
