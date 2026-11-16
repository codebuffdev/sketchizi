import { useEffect, useMemo, useState } from "react";
import { listPersonalTemplates, updatePersonalTemplateRules } from "../templates/personalTemplateStore.js";

const toText = (items) => (items || []).join(", ");
const toRelationshipsText = (items) => (items || []).map(([from, to]) => `${from} -> ${to}`).join("\n");

export default function TemplateRulesEditorDialog({ open, onClose, onSaved }) {
  const templates = useMemo(() => listPersonalTemplates(), [open]);
  const [templateId, setTemplateId] = useState("");
  const [requiredText, setRequiredText] = useState("");
  const [relationshipsText, setRelationshipsText] = useState("");
  const [ruleMode, setRuleMode] = useState("guided");
  const [error, setError] = useState("");
  const selected = templates.find((template) => template.id === templateId) || null;

  useEffect(() => {
    if (!open) return;
    const first = listPersonalTemplates()[0];
    setTemplateId(first?.id || "");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!selected) { setRequiredText(""); setRelationshipsText(""); setRuleMode("guided"); return; }
    setRequiredText(toText(selected.requiredRoles));
    setRelationshipsText(toRelationshipsText(selected.allowedRelationships));
    setRuleMode(selected.ruleMode === "strict" ? "strict" : "guided");
    setError("");
  }, [templateId]);

  if (!open) return null;
  const save = (event) => {
    event.preventDefault();
    if (!selected) { setError("Choose a personal template first."); return; }
    const requiredRoles = requiredText.split(/[,,\n]/).map((value) => value.trim()).filter(Boolean);
    const allowedRelationships = relationshipsText.split(/\n|,/).map((line) => {
      const match = line.trim().match(/^([a-zA-Z0-9 _-]+)\s*(?:->|→)\s*([a-zA-Z0-9 _-]+)$/);
      return match ? [match[1].trim(), match[2].trim()] : null;
    });
    const invalid = relationshipsText.split(/\n|,/).some((line) => line.trim() && !/^([a-zA-Z0-9 _-]+)\s*(?:->|→)\s*([a-zA-Z0-9 _-]+)$/.test(line.trim()));
    if (invalid) { setError("Use one allowed connection per line, for example: client -> service"); return; }
    try {
      const updated = updatePersonalTemplateRules(selected.id, { requiredRoles, allowedRelationships: allowedRelationships.filter(Boolean), ruleMode });
      onSaved?.(updated);
      onClose();
    } catch (saveError) { setError(saveError?.message || "Unable to save template rules."); }
  };

  return <div className="design-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="design-dialog template-rules-editor" role="dialog" aria-modal="true" aria-labelledby="template-rules-title">
      <header className="design-dialog-header"><div><p className="design-dialog-eyebrow">PERSONAL TEMPLATE LIBRARY</p><h2 id="template-rules-title">Template rules editor</h2><p>Define required roles and allowed connections for reusable templates.</p></div><button type="button" className="design-dialog-close" onClick={onClose} aria-label="Close template rules editor">×</button></header>
      {!templates.length ? <div className="design-validation-empty"><strong>No personal templates yet</strong><p>Create a diagram and use “Save as Personal Template…” before defining rules.</p><button type="button" className="design-primary-button" onClick={onClose}>Done</button></div> : <form onSubmit={save}>
        <div className="design-form-field"><label htmlFor="rules-template-select">Personal template</label><select id="rules-template-select" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><span className="design-field-hint">Rules are stored with this personal template and reused when creating new designs.</span></div>
        <div className="design-form-field"><label htmlFor="rules-required-roles">Required component roles</label><input id="rules-required-roles" value={requiredText} onChange={(event) => setRequiredText(event.target.value)} placeholder="client, service, database"/><span className="design-field-hint">Comma-separated role names. Labels such as “API server” are inferred as service; custom roles can be assigned in element metadata.</span></div>
        <div className="design-form-field"><label htmlFor="rules-allowed-connections">Allowed connections</label><textarea id="rules-allowed-connections" value={relationshipsText} onChange={(event) => setRelationshipsText(event.target.value)} rows={5} placeholder={'client -> service\nservice -> database'}/><span className="design-field-hint">One directed connection per line. Leave empty to allow any connection.</span></div>
        <fieldset className="design-rule-options"><legend>Default rule mode for this template</legend><label><input type="radio" name="template-rule-mode" checked={ruleMode === "guided"} onChange={() => setRuleMode("guided")}/><span><strong>Guided</strong><small>Report violations as warnings.</small></span></label><label><input type="radio" name="template-rule-mode" checked={ruleMode === "strict"} onChange={() => setRuleMode("strict")}/><span><strong>Strict</strong><small>Report violations as errors during validation.</small></span></label></fieldset>
        {error && <p className="template-rules-error" role="alert">{error}</p>}
        <footer className="design-dialog-footer"><span>Changes apply to future designs created from this template.</span><div><button type="button" className="design-secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="design-primary-button">Save rules</button></div></footer>
      </form>}
    </section>
  </div>;
}
