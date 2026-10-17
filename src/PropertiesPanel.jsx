export default function PropertiesPanel({
  selectedCount, propertiesOpen, setPropertiesOpen, firstSelected, hasShapeSelection,
  hasArrowSelection, hasTextSelection, applyToSelected, applyToSelectedArrow, updateSingleSelected,
  awsResource = null, awsResourceDefinition = null, updateAwsResource = () => {},
  kubernetesResource = null, kubernetesResourceDefinition = null, updateKubernetesResource = () => {},
  networkingResource = null, networkingResourceDefinition = null, updateNetworkingResource = () => {},
  architectureRelationship = null, architectureRelationshipTypes = [], updateArchitectureRelationshipType = () => {},
  awsRelationship = null, relationshipTypes = [], updateAwsRelationshipType = () => {},
  kubernetesRelationship = null, kubernetesRelationshipTypes = [], updateKubernetesRelationshipType = () => {},
  readOnly = false, authorship = {}, participants = [],
}) {
  return (
  <section className={`properties-panel${readOnly ? " read-only" : ""}`} aria-label="Properties and style">
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

    {architectureRelationship && (
      <div className="properties-section architecture-relationship-properties">
        <div className="properties-section-title">Architecture Relationship</div>
        <div className="property-row"><label htmlFor="architecture-relationship-type">Type</label>
          <select id="architecture-relationship-type" value={architectureRelationship.relationshipType} disabled={readOnly} onChange={(event) => updateArchitectureRelationshipType(event.target.value)}>
            {architectureRelationshipTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>
    )}

    {awsRelationship && (
      <div className="properties-section aws-relationship-properties">
        <div className="properties-section-title">AWS Relationship</div>
        <div className="property-row">
          <label htmlFor="aws-relationship-type">Type</label>
          <select
            id="aws-relationship-type"
            value={awsRelationship.relationshipType}
            disabled={readOnly}
            onChange={(event) => updateAwsRelationshipType(event.target.value)}
          >
            {relationshipTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>
    )}

    {kubernetesRelationship && (
      <div className="properties-section kubernetes-relationship-properties">
        <div className="properties-section-title">Kubernetes Relationship</div>
        <div className="property-row">
          <label htmlFor="kubernetes-relationship-type">Type</label>
          <select
            id="kubernetes-relationship-type"
            value={kubernetesRelationship.relationshipType}
            disabled={readOnly}
            onChange={(event) => updateKubernetesRelationshipType(event.target.value)}
          >
            {kubernetesRelationshipTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>
    )}

    {awsResource && awsResourceDefinition && (
      <div className="properties-section aws-resource-properties">
        <div className="properties-section-title">AWS Resource</div>
        <div className="aws-resource-meta">
          <strong>{awsResourceDefinition.displayName}</strong>
          <span>{awsResource.service} · {awsResource.resourceType}</span>
        </div>
        {awsResourceDefinition.properties.map((property) => {
          const value = awsResource.properties?.[property.key] ?? property.defaultValue ?? "";
          return (
            <div className="property-row" key={property.key}>
              <label htmlFor={`aws-resource-${property.key}`}>{property.label}</label>
              {property.type === "select" ? (
                <select
                  id={`aws-resource-${property.key}`}
                  value={value}
                  disabled={readOnly}
                  onChange={(event) => updateAwsResource({ [property.key]: event.target.value })}
                >
                  {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  id={`aws-resource-${property.key}`}
                  className="property-number"
                  type="text"
                  value={value}
                  disabled={readOnly}
                  onChange={(event) => updateAwsResource({ [property.key]: event.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>
    )}

    {networkingResource && networkingResourceDefinition && (
      <div className="properties-section networking-resource-properties">
        <div className="properties-section-title">Networking Resource</div>
        <div className="aws-resource-meta"><strong>{networkingResourceDefinition.displayName}</strong><span>Networking · {networkingResource.resourceType}</span></div>
        {networkingResourceDefinition.properties.map((property) => {
          const value = networkingResource.properties?.[property.key] ?? property.defaultValue ?? "";
          return <div className="property-row" key={property.key}>
            <label htmlFor={`networking-resource-${property.key}`}>{property.label}</label>
            {property.type === "select" ? <select id={`networking-resource-${property.key}`} value={value} disabled={readOnly} onChange={(event) => updateNetworkingResource({ [property.key]: event.target.value })}>{property.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input id={`networking-resource-${property.key}`} type="text" value={value} disabled={readOnly} placeholder={property.placeholder || ""} onChange={(event) => updateNetworkingResource({ [property.key]: event.target.value })}/>}
          </div>;
        })}
      </div>
    )}

    {kubernetesResource && kubernetesResourceDefinition && (
      <div className="properties-section kubernetes-resource-properties">
        <div className="properties-section-title">Kubernetes Resource</div>
        <div className="aws-resource-meta">
          <strong>{kubernetesResourceDefinition.displayName}</strong>
          <span>Kubernetes · {kubernetesResource.resourceType}</span>
        </div>
        {kubernetesResourceDefinition.properties.map((property) => {
          const value = kubernetesResource.properties?.[property.key] ?? property.defaultValue ?? "";
          return (
            <div className="property-row" key={property.key}>
              <label htmlFor={`kubernetes-resource-${property.key}`}>{property.label}</label>
              {property.type === "select" ? (
                <select
                  id={`kubernetes-resource-${property.key}`}
                  value={value}
                  disabled={readOnly}
                  onChange={(event) => updateKubernetesResource({ [property.key]: event.target.value })}
                >
                  {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  id={`kubernetes-resource-${property.key}`}
                  className="property-number"
                  type={property.type === "number" ? "number" : "text"}
                  value={value}
                  disabled={readOnly}
                  onChange={(event) => updateKubernetesResource({ [property.key]: property.type === "number" ? Number(event.target.value) : event.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>
    )}

    <div className="properties-section properties-appearance">
      <div className="properties-section-title">Appearance</div>

      {hasShapeSelection && (
        <>
          <div className="style-group">
            <div className="style-group-label">Stroke</div>
            <div className="swatch-row">
              {[
                ["#2f2f33", "Ink"],
                ["#d25555", "Red"],
                ["#3f9b57", "Green"],
                ["#3d79b9", "Blue"],
                ["#d98a27", "Orange"],
                ["#4d87bd", "Sky"],
              ].map(([color, label]) => (
                <button
                  key={color}
                  type="button"
                  className={`style-swatch ${firstSelected?.strokeColor?.toLowerCase() === color ? "selected" : ""}`}
                  style={{ background: color }}
                  aria-label={`Stroke ${label}`}
                  title={label}
                  onClick={() => applyToSelected({ strokeColor: color })}
                />
              ))}
            </div>
          </div>

          <div className="style-group">
            <div className="style-group-label">Background</div>
            <div className="swatch-row">
              {[
                ["transparent", "Transparent"],
                ["#e7bfc1", "Rose"],
                ["#b9dfc0", "Mint"],
                ["#a8c7e5", "Blue"],
                ["#e2d8b9", "Sand"],
                ["#a9c8e1", "Sky"],
              ].map(([color, label]) => (
                <button
                  key={color}
                  type="button"
                  className={`style-swatch background-swatch ${firstSelected?.backgroundColor?.toLowerCase() === color ? "selected" : ""}`}
                  style={color === "transparent" ? undefined : { background: color }}
                  aria-label={`Background ${label}`}
                  title={label}
                  onClick={() => applyToSelected({ backgroundColor: color })}
                >{color === "transparent" ? "" : null}</button>
              ))}
            </div>
          </div>

          <div className="style-group">
            <div className="style-group-label">Fill</div>
            <div className="style-options three">
              {[
                ["hachure", "Hachure", "///"],
                ["cross-hatch", "Cross hatch", "###"],
                ["solid", "Solid", "■"],
              ].map(([value, label, glyph]) => (
                <button
                  key={value}
                  type="button"
                  className={firstSelected?.fillStyle === value ? "selected" : ""}
                  aria-label={label}
                  title={label}
                  onClick={() => applyToSelected({ fillStyle: value })}
                ><span>{glyph}</span></button>
              ))}
            </div>
          </div>

          <div className="style-group">
            <div className="style-group-label">Stroke width</div>
            <div className="style-options three">
              {[1, 2, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={Number(firstSelected?.strokeWidth) === value ? "selected" : ""}
                  aria-label={`${value}px stroke`}
                  title={`${value}px`}
                  onClick={() => applyToSelected({ strokeWidth: value })}
                ><span className={`stroke-preview width-${value}`} /></button>
              ))}
            </div>
          </div>

          {firstSelected?.type === "freedraw" && (
            <div className="style-group">
              <div className="style-group-label">Pressure</div>
              <div className="style-options two">
                {[
                  ["constant", "Constant", "—"],
                  ["variable", "Variable", "〰"],
                ].map(([value, label, glyph]) => (
                  <button
                    key={value}
                    type="button"
                    className={firstSelected?.strokeVariability === value ? "selected" : ""}
                    aria-label={label}
                    title={label}
                    onClick={() => applyToSelected({ strokeVariability: value })}
                  ><span>{glyph}</span></button>
                ))}
              </div>
            </div>
          )}

          <div className="style-group">
            <div className="style-group-label">Line style</div>
            <div className="style-options three">
              {[
                ["solid", "Solid", "━━━━"],
                ["dashed", "Dashed", "— —"],
                ["dotted", "Dotted", "· · ·"],
              ].map(([value, label, glyph]) => (
                <button
                  key={value}
                  type="button"
                  className={firstSelected?.strokeStyle === value ? "selected" : ""}
                  aria-label={label}
                  title={label}
                  onClick={() => applyToSelected({ strokeStyle: value })}
                ><span>{glyph}</span></button>
              ))}
            </div>
          </div>

          <div className="style-group">
            <div className="style-group-label">Roughness</div>
            <div className="style-options three">
              {[[0, "Architect"], [1, "Artist"], [2, "Cartoonist"]].map(([value, label]) => (
                <button key={value} type="button" className={Number(firstSelected?.roughness ?? 1) === value ? "selected" : ""} onClick={() => applyToSelected({ roughness: value })} title={label} aria-label={label}>
                  <span>{label.slice(0, 1)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="style-group opacity-group">
        <div className="property-label-line">
          <div className="style-group-label">Opacity</div>
          <span>{Math.round(firstSelected?.opacity ?? 100)}</span>
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

    {selectedCount === 1 && firstSelected && (authorship[firstSelected.id]?.createdBy || authorship[firstSelected.id]?.lastModifiedBy) && (
      <div className="properties-section collaboration-authorship">
        <div className="properties-section-title">Collaboration</div>
        <div className="property-row"><label>Created by</label><span>{participants.find((participant) => participant.participantId === authorship[firstSelected.id]?.createdBy)?.displayName || "Unknown"}</span></div>
        {authorship[firstSelected.id]?.lastModifiedBy && <div className="property-row"><label>Last modified by</label><span>{participants.find((participant) => participant.participantId === authorship[firstSelected.id]?.lastModifiedBy)?.displayName || "Unknown"}</span></div>}
      </div>
    )}
  </section>
  );
}
