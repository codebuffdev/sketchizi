import { createPortal } from "react-dom";

export default function LayoutToolbar({
  layoutOpen, setLayoutOpen, propertiesOpen, selectedCount, applyLayout,
  gridEnabled, toggleGrid, setGrid, gridSize, readOnly = false, showTrigger = true,
}) {
  const panel = layoutOpen ? (
    <section className="layout-panel-portal" aria-label="Alignment and grid tools">
      <div className="layout-popover">
        {readOnly && <div className="layout-readonly-note">Viewer · read only</div>}
        <div className="layout-popover-title">ALIGN & DISTRIBUTE</div>
        <div className="layout-section-label">Align</div>
        <div className="layout-grid-buttons">
          {[
            ["left", "Left", "⇤"],
            ["center", "Center", "↔"],
            ["right", "Right", "⇥"],
            ["top", "Top", "⇡"],
            ["middle", "Middle", "↕"],
            ["bottom", "Bottom", "⇣"],
          ].map(([op, label, icon]) => (
            <button key={op} type="button" disabled={readOnly || selectedCount < 2} onClick={() => applyLayout(op)} title={label}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
        <div className="layout-section-label">Distribute</div>
        <div className="layout-grid-buttons two">
          <button type="button" disabled={readOnly || selectedCount < 3} onClick={() => applyLayout("distribute-horizontal")}>↔ Horizontal</button>
          <button type="button" disabled={readOnly || selectedCount < 3} onClick={() => applyLayout("distribute-vertical")}>↕ Vertical</button>
        </div>
        <div className="layout-divider" />
        <div className="grid-row">
          <div>
            <div className="layout-section-label">Grid</div>
            <div className="grid-description">Snap objects to a consistent spacing.</div>
          </div>
          <button type="button" className={gridEnabled ? "grid-toggle enabled" : "grid-toggle"} disabled={readOnly} onClick={toggleGrid}>
            {gridEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className="grid-size-row">
          <span>Size</span>
          <input
            type="number"
            min="5"
            max="100"
            step="5"
            value={gridSize}
            disabled={readOnly} onChange={(event) => setGrid(true, event.target.value)}
            aria-label="Grid size"
          />
          <span>px</span>
        </div>
        <div className="layout-shortcuts">L: toggle Layout · Esc: close · Grid snaps while placing</div>
      </div>
    </section>
  ) : null;

  return (
<>
<section className={showTrigger ? (propertiesOpen ? "layout-toolbar properties-open" : "layout-toolbar") : "layout-trigger-host"} aria-label="Alignment and grid tools">
  {showTrigger && <button
    type="button"
    className={layoutOpen ? "layout-button active" : "layout-button"}
    onClick={() => setLayoutOpen((open) => !open)}
    title="Alignment and grid (L)"
    aria-label="Layout (L)"
  >
    <span className="layout-icon">⌗</span>
    <span>Layout</span>
    <kbd className="layout-key">L</kbd>
    {selectedCount > 0 && <span className="selection-badge">{selectedCount}</span>}
  </button>}
</section>
{typeof document !== "undefined" && createPortal(panel, document.body)}
</>
  );
}
