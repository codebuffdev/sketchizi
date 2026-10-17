import { useMemo, useState } from "react";
import { validateDesignTemplate } from "../validation/templateValidator.js";
import { getDesignTemplate } from "../templates/templateRegistry.js";

export default function DesignValidationDialog({ open, onClose, apiRef, profile }) {
  const [revision, setRevision] = useState(0);
  const result = useMemo(() => {
    const elements = apiRef.current?.getSceneElements?.() || [];
    return validateDesignTemplate(elements, profile);
  }, [apiRef, profile, revision]);
  if (!open) return null;
  const template = profile?.templateId ? getDesignTemplate(profile.templateId) : null;
  const errors = result.filter((item) => item.severity === "error").length;
  const warnings = result.filter((item) => item.severity === "warning").length;

  return (
    <div className="design-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="design-dialog design-validation-dialog" role="dialog" aria-modal="true" aria-labelledby="design-validation-title">
        <header className="design-dialog-header">
          <div>
            <p className="design-dialog-eyebrow">DESIGN QUALITY</p>
            <h2 id="design-validation-title">Design validation</h2>
            <p>{template ? `${template.name} · ${profile.ruleMode} rules` : "Freeform design · no template constraints"}</p>
          </div>
          <button type="button" className="design-dialog-close" onClick={onClose} aria-label="Close design validation">×</button>
        </header>
        <div className="design-validation-summary">
          <span className={errors ? "design-validation-count has-errors" : "design-validation-count"}>{errors} errors</span>
          <span className={warnings ? "design-validation-count has-warnings" : "design-validation-count"}>{warnings} warnings</span>
          <span className="design-validation-count">{result.length} findings</span>
        </div>
        {result.length ? (
          <ul className="design-diagnostics-list">
            {result.map((item, index) => (
              <li key={`${item.code}-${item.elementId || index}`} className={`design-diagnostic ${item.severity}`}>
                <span className="design-diagnostic-severity">{item.severity}</span>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="design-validation-empty"><span aria-hidden="true">✓</span><strong>{template ? "No template violations found" : "Ready for freeform design"}</strong><p>{template ? "The current diagram satisfies the rules checked by this template." : "Choose a template to enable domain-specific design checks."}</p></div>
        )}
        <footer className="design-dialog-footer">
          <span>Validation is based on the current canvas.</span>
          <div>
            <button type="button" className="design-secondary-button" onClick={() => setRevision((value) => value + 1)}>Recheck</button>
            <button type="button" className="design-primary-button" onClick={onClose}>Done</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
