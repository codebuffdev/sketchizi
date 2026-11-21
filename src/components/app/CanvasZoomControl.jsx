import { useEffect, useRef, useState } from "react";

// Header zoom pill: shows only the live percentage. Clicking it opens a small
// menu that runs the existing view.* zoom commands, so behaviour matches the
// keyboard shortcuts and the View menu.
function readZoomPercent(api) {
  const value = Number(api?.getAppState?.()?.zoom?.value);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 100;
}

export default function CanvasZoomControl({ api, onZoomIn, onZoomOut, onReset, onFit, onBeforeOpen }) {
  const [percent, setPercent] = useState(() => readZoomPercent(api));
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const run = (action) => () => {
    setOpen(false);
    action?.();
  };
  const items = [
    ["Zoom In", "Ctrl++", onZoomIn],
    ["Zoom Out", "Ctrl+-", onZoomOut],
    ["Reset to 100%", "Ctrl+0", onReset],
    ["Fit to Screen", "", onFit],
  ];

  return (
    <div className="desktop-app-zoom-wrap" ref={rootRef}>
      <button
        type="button"
        className="desktop-app-zoom-control"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Zoom ${percent}%. Zoom options`}
        title="Zoom options"
        onClick={() => {
          if (!open) onBeforeOpen?.();
          setOpen(!open);
        }}
      >
        {percent}%
      </button>
      {open && (
        <div className="desktop-app-top-popover desktop-app-zoom-menu" role="menu" aria-label="Zoom options">
          {items.map(([label, shortcut, action]) => (
            <button type="button" role="menuitem" key={label} onClick={run(action)}>
              <span>{label}</span>
              {shortcut && <kbd>{shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
