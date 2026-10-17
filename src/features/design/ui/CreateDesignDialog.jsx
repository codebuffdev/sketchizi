import { useMemo, useState } from "react";
import { DESIGN_DOMAINS } from "../model/designDocument.js";
import { listDesignTemplates } from "../templates/templateRegistry.js";

export default function CreateDesignDialog({ open, onClose, onCreate }) {
  const templates = useMemo(() => listDesignTemplates(), []);
  const [mode, setMode] = useState("template");
  const [templateId, setTemplateId] = useState("system-design.general");
  const [domain, setDomain] = useState("general");
  const [ruleMode, setRuleMode] = useState("guided");
  const [name, setName] = useState("My design");

  if (!open) return null;
  const selectedTemplate = templates.find((template) => template.id === templateId) || templates[0];
  const activeDomain = mode === "template" ? selectedTemplate.domain : domain;

  const submit = (event) => {
    event.preventDefault();
    onCreate({ mode, templateId: mode === "template" ? templateId : "general.blank", domain: activeDomain, ruleMode, name });
  };

  return (
    <div className="design-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="design-dialog" role="dialog" aria-modal="true" aria-labelledby="design-dialog-title">
        <header className="design-dialog-header">
          <div>
            <p className="design-dialog-eyebrow">SKETCHIZI WORKSPACE</p>
            <h2 id="design-dialog-title">Create a design</h2>
            <p>Start freeform or use a template with reusable design rules.</p>
          </div>
          <button type="button" className="design-dialog-close" onClick={onClose} aria-label="Close create design dialog">×</button>
        </header>

        <form onSubmit={submit}>
          <fieldset className="design-mode-options">
            <legend>How do you want to start?</legend>
            <label className={mode === "blank" ? "design-mode-card selected" : "design-mode-card"}>
              <input type="radio" name="design-mode" value="blank" checked={mode === "blank"} onChange={() => setMode("blank")} />
              <span className="design-mode-icon" aria-hidden="true">✎</span>
              <span><strong>Blank canvas</strong><small>Design anything without restrictions.</small></span>
            </label>
            <label className={mode === "template" ? "design-mode-card selected" : "design-mode-card"}>
              <input type="radio" name="design-mode" value="template" checked={mode === "template"} onChange={() => { setMode("template"); setTemplateId("system-design.general"); setName("System architecture"); }} />
              <span className="design-mode-icon" aria-hidden="true">▦</span>
              <span><strong>Use a template</strong><small>Start with a structure and design rules.</small></span>
            </label>
            <label className={mode === "pattern" ? "design-mode-card selected" : "design-mode-card"}>
              <input type="radio" name="design-mode" value="pattern" checked={mode === "pattern"} onChange={() => { setMode("pattern"); setTemplateId("pattern.layered-architecture"); setName("Layered architecture"); }} />
              <span className="design-mode-icon" aria-hidden="true">◇</span>
              <span><strong>Use a design pattern</strong><small>Start from a reusable architecture or software pattern.</small></span>
            </label>
          </fieldset>

          {mode === "template" || mode === "pattern" ? (
            <div className="design-form-field">
              <label htmlFor="design-template">{mode === "pattern" ? "Design pattern" : "Template"}</label>
              <div className="design-template-grid" role="radiogroup" aria-label={mode === "pattern" ? "Design pattern" : "Design template"}>
                {templates.filter((template) => mode === "pattern" ? template.creationMode === "pattern" : template.creationMode === "template").map((template) => (
                  <button type="button" key={template.id} className={templateId === template.id ? "design-template-card selected" : "design-template-card"} onClick={() => { setTemplateId(template.id); setName(template.name); }} aria-pressed={templateId === template.id}>
                    <span className="design-template-category">{template.category}</span>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </button>
                ))}
              </div>
              <span id="design-template" className="design-field-hint">The template can be changed later by editing the design profile.</span>
            </div>
          ) : (
            <div className="design-form-field">
              <label htmlFor="design-domain">Design domain</label>
              <select id="design-domain" value={domain} onChange={(event) => setDomain(event.target.value)}>
                {DESIGN_DOMAINS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
          )}

          <div className="design-form-field">
            <label htmlFor="design-name">Design name</label>
            <input id="design-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required />
          </div>

          {(mode === "template" || mode === "pattern") && (
            <fieldset className="design-rule-options">
              <legend>{mode === "pattern" ? "Pattern rules" : "Template rules"}</legend>
              <label><input type="radio" name="design-rule-mode" value="guided" checked={ruleMode === "guided"} onChange={() => setRuleMode("guided")} /><span><strong>Guided</strong><small>Show suggestions and warnings while keeping editing flexible.</small></span></label>
              <label><input type="radio" name="design-rule-mode" value="strict" checked={ruleMode === "strict"} onChange={() => setRuleMode("strict")} /><span><strong>Strict</strong><small>Treat template violations as errors during validation.</small></span></label>
            </fieldset>
          )}

          <footer className="design-dialog-footer">
            <span>Existing drawings and file formats remain unchanged.</span>
            <div>
              <button type="button" className="design-secondary-button" onClick={onClose}>Cancel</button>
              <button type="submit" className="design-primary-button">Create design</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
