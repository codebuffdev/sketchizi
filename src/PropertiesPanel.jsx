export default function PropertiesPanel({
  selectedCount, propertiesOpen, setPropertiesOpen, firstSelected, hasShapeSelection,
  hasArrowSelection, hasTextSelection, applyToSelected, applyToSelectedArrow, updateSingleSelected,
}) {
  return (
  <section className="properties-panel" aria-label="Properties and style">
    <div className="properties-header">
      <div>
        <div className="properties-title">Properties</div>
        <div className="properties-subtitle">
          {selectedCount === 1
            ? `${firstSelected?.type || "object"} selected`
            : `${selectedCount} objects selected`}
        </div>
      </div>
      <button
        type="button"
        className="properties-close"
        onClick={() => setPropertiesOpen(false)}
        aria-label="Close properties"
      >×</button>
    </div>

    <div className="properties-section">
      <div className="properties-section-title">Appearance</div>

      {hasShapeSelection && (
        <>
          <div className="property-row">
            <label htmlFor="prop-stroke-color">Stroke</label>
            <div className="color-control">
              <input
                id="prop-stroke-color"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(firstSelected?.strokeColor || "") ? firstSelected.strokeColor : "#000000"}
                onChange={(event) => applyToSelected({ strokeColor: event.target.value })}
                aria-label="Stroke color"
              />
              <input
                className="color-text"
                value={/^#[0-9a-fA-F]{6}$/.test(firstSelected?.strokeColor || "") ? firstSelected.strokeColor : "#000000"}
                onChange={(event) => applyToSelected({ strokeColor: event.target.value })}
                aria-label="Stroke color hex"
              />
            </div>
          </div>

          <div className="property-row">
            <label htmlFor="prop-background">Background</label>
            <div className="color-control">
              <input
                id="prop-background"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(firstSelected?.backgroundColor || "") ? firstSelected.backgroundColor : "#ffffff"}
                onChange={(event) => applyToSelected({ backgroundColor: event.target.value })}
                aria-label="Background color"
              />
              <input
                className="color-text"
                value={/^#[0-9a-fA-F]{6}$/.test(firstSelected?.backgroundColor || "") ? firstSelected.backgroundColor : "#ffffff"}
                onChange={(event) => applyToSelected({ backgroundColor: event.target.value })}
                aria-label="Background color hex"
              />
            </div>
          </div>

          <div className="property-row">
            <label>Stroke width</label>
            <select
              value={firstSelected?.strokeWidth || 1}
              onChange={(event) => applyToSelected({ strokeWidth: Number(event.target.value) })}
            >
              {[0, 1, 2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}px</option>)}
            </select>
          </div>

          <div className="property-row">
            <label>Line style</label>
            <select
              value={firstSelected?.strokeStyle || "solid"}
              onChange={(event) => applyToSelected({ strokeStyle: event.target.value })}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          <div className="property-row">
            <label>Roughness</label>
            <select
              value={firstSelected?.roughness ?? 1}
              onChange={(event) => applyToSelected({ roughness: Number(event.target.value) })}
            >
              <option value="0">Architect</option>
              <option value="1">Artist</option>
              <option value="2">Cartoonist</option>
            </select>
          </div>
        </>
      )}

      <div className="property-row property-row-stack">
        <div className="property-label-line">
          <label htmlFor="prop-opacity">Opacity</label>
          <span>{Math.round((firstSelected?.opacity ?? 100))}%</span>
        </div>
        <input
          id="prop-opacity"
          className="property-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={firstSelected?.opacity ?? 100}
          onChange={(event) => applyToSelected({ opacity: Number(event.target.value) })}
        />
      </div>
    </div>

    {hasArrowSelection && (
      <div className="properties-section">
        <div className="properties-section-title">Connection</div>
        <div className="property-row">
          <label>Shape</label>
          <div className="property-segmented">
            <button type="button" className={!firstSelected?.elbowed ? "selected" : ""} onClick={() => applyToSelectedArrow({ elbowed: false })}>Straight</button>
            <button type="button" className={firstSelected?.elbowed ? "selected" : ""} onClick={() => applyToSelectedArrow({ elbowed: true })}>Elbow</button>
          </div>
        </div>
        <div className="property-row">
          <label>Start</label>
          <select value={firstSelected?.startArrowhead || "none"} onChange={(event) => applyToSelectedArrow({ startArrowhead: event.target.value === "none" ? null : event.target.value })}>
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="bar">Bar</option>
            <option value="dot">Dot</option>
          </select>
        </div>
        <div className="property-row">
          <label>End</label>
          <select value={firstSelected?.endArrowhead || "none"} onChange={(event) => applyToSelectedArrow({ endArrowhead: event.target.value === "none" ? null : event.target.value })}>
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="bar">Bar</option>
            <option value="dot">Dot</option>
          </select>
        </div>
      </div>
    )}

    {hasTextSelection && selectedCount === 1 && firstSelected?.type === "text" && (
      <div className="properties-section">
        <div className="properties-section-title">Text</div>
        <div className="property-row">
          <label>Font size</label>
          <input
            className="property-number"
            type="number"
            min="8"
            max="200"
            value={firstSelected.fontSize || 20}
            onChange={(event) => updateSingleSelected({ fontSize: Math.max(8, Number(event.target.value) || 20) })}
          />
        </div>
        <div className="property-row">
          <label>Align</label>
          <select value={firstSelected.textAlign || "left"} onChange={(event) => updateSingleSelected({ textAlign: event.target.value })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    )}

    {selectedCount === 1 && firstSelected && (
      <div className="properties-section">
        <div className="properties-section-title">Position & size</div>
        <div className="property-grid-2">
          <label>X<input className="property-number" type="number" value={Math.round(firstSelected.x)} onChange={(event) => updateSingleSelected({ x: Number(event.target.value) || 0 })} /></label>
          <label>Y<input className="property-number" type="number" value={Math.round(firstSelected.y)} onChange={(event) => updateSingleSelected({ y: Number(event.target.value) || 0 })} /></label>
          <label>W<input className="property-number" type="number" min="1" value={Math.round(firstSelected.width)} onChange={(event) => updateSingleSelected({ width: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label>H<input className="property-number" type="number" min="1" value={Math.round(firstSelected.height)} onChange={(event) => updateSingleSelected({ height: Math.max(1, Number(event.target.value) || 1) })} /></label>
        </div>
        <div className="property-row">
          <label>Angle</label>
          <input className="property-number" type="number" value={Math.round(((firstSelected.angle || 0) * 180) / Math.PI)} onChange={(event) => updateSingleSelected({ angle: ((Number(event.target.value) || 0) * Math.PI) / 180 })} />
        </div>
      </div>
    )}
  </section>
  );
}
