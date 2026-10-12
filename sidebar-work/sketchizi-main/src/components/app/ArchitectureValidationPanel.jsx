function DiagnosticGroup({ title, diagnostics, onSelectDiagnostic }) {
  if (!diagnostics.length) return null;

  return (
    <section className={`architecture-validation-section severity-${title.toLowerCase()}`}>
      <div className="architecture-validation-section-title">
        <span>{title}</span>
        <span className="architecture-validation-count">{diagnostics.length}</span>
      </div>
      <div className="architecture-validation-list">
        {diagnostics.map((diagnostic) => {
          const selectable = Boolean(diagnostic.relationshipId || diagnostic.resourceId);
          const content = (
            <>
              <div className="architecture-validation-diagnostic-message">{diagnostic.message}</div>
              {diagnostic.code === "KUBERNETES_INVALID_RELATIONSHIP" && (
                <div className="architecture-validation-diagnostic-details">
                  <span>{diagnostic.sourceResourceType || diagnostic.sourceResourceId || "Unknown source"}</span>
                  <span aria-hidden="true">→</span>
                  <span>{diagnostic.targetResourceType || diagnostic.targetResourceId || "Unknown target"}</span>
                  {diagnostic.relationshipType && <span>Type: {diagnostic.relationshipType}</span>}
                </div>
              )}
              {diagnostic.code === "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE" && diagnostic.relationshipType && (
                <div className="architecture-validation-diagnostic-details">
                  Type: {diagnostic.relationshipType}
                </div>
              )}
              <div className="architecture-validation-diagnostic-meta">
                {diagnostic.provider && <span className="architecture-validation-provider">{diagnostic.provider}</span>}
                <span className="architecture-validation-diagnostic-code">{diagnostic.code}</span>
              </div>
            </>
          );

          return selectable ? (
            <button
              type="button"
              className="architecture-validation-diagnostic architecture-validation-diagnostic-action"
              key={diagnostic.diagnosticId}
              onClick={() => onSelectDiagnostic?.(diagnostic)}
              title="Select affected canvas element"
            >
              {content}
            </button>
          ) : (
            <article className="architecture-validation-diagnostic" key={diagnostic.diagnosticId}>
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ArchitectureValidationPanel({ validation, onClose, onSelectDiagnostic }) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const info = validation?.info || [];
  const hasDiagnostics = errors.length > 0 || warnings.length > 0 || info.length > 0;

  return (
    <section className="architecture-validation-panel" aria-label="Architecture Validation">
      <header className="architecture-validation-header">
        <div>
          <div className="architecture-validation-title">Architecture Validation</div>
          <div className="architecture-validation-subtitle">Current canvas diagnostics</div>
        </div>
        <button
          type="button"
          className="architecture-validation-close"
          onClick={onClose}
          aria-label="Close architecture validation"
        >×</button>
      </header>

      {!hasDiagnostics ? (
        <div className="architecture-validation-empty">No architecture issues detected.</div>
      ) : (
        <div className="architecture-validation-content">
          <DiagnosticGroup title="Errors" diagnostics={errors} onSelectDiagnostic={onSelectDiagnostic} />
          <DiagnosticGroup title="Warnings" diagnostics={warnings} onSelectDiagnostic={onSelectDiagnostic} />
          <DiagnosticGroup title="Info" diagnostics={info} onSelectDiagnostic={onSelectDiagnostic} />
        </div>
      )}
    </section>
  );
}
