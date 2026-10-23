import { useEffect, useMemo, useState } from "react";
import { listDesignTemplates } from "../templates/templateRegistry.js";
import { filterDesignTemplates, previewLayoutForTemplate } from "../templates/templateCatalog.js";

const CATEGORIES = [
  { id: "all", label: "All designs" },
  { id: "aws", label: "AWS architecture" },
  { id: "system", label: "System design" },
  { id: "patterns", label: "Design patterns" },
  { id: "flows", label: "Flows & data" },
];

function TemplatePreview({ template }) {
  const layout = previewLayoutForTemplate(template);
  return (
    <span className={`design-studio-template-preview preview-${layout.kind}`} aria-hidden="true" data-preview-template={template.id}>
      {layout.nodes.map((node, index) => (
        <span className={`preview-node preview-node-${index + 1}`} key={`${template.id}-${node}`}>
          <span className="preview-node-dot" />
          <span className="preview-node-label">{node}</span>
        </span>
      ))}
      {layout.nodes.slice(1).map((node, index) => (
        <span className={`preview-connector preview-connector-${index + 1}`} key={`${template.id}-edge-${node}`} />
      ))}
    </span>
  );
}

export default function CreateDesignScreen({ onCreate, onClose, isDarkTheme = false }) {
  const templates = useMemo(() => listDesignTemplates(), []);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("system-design.general");
  const [configure, setConfigure] = useState(false);
  const [name, setName] = useState("System architecture");
  const [ruleMode, setRuleMode] = useState("guided");
  const [includeCache, setIncludeCache] = useState(false);
  const visibleTemplates = useMemo(() => filterDesignTemplates(templates, { category, query: search }), [templates, category, search]);
  const selectedTemplate = visibleTemplates.find((template) => template.id === selectedId) || null;

  useEffect(() => {
    if (visibleTemplates.some((template) => template.id === selectedId)) return;
    const nextTemplate = visibleTemplates[0] || null;
    setSelectedId(nextTemplate?.id || "");
    if (nextTemplate) {
      setName(nextTemplate.name);
      setRuleMode(nextTemplate.ruleMode || "guided");
    }
  }, [visibleTemplates, selectedId]);

  const startBlank = () => onCreate({ mode: "blank", templateId: "general.blank", name: "Untitled design", domain: "general", ruleMode: "guided" });
  const startSelected = () => {
    if (!selectedTemplate) return;
    onCreate({
      mode: selectedTemplate.creationMode,
      templateId: selectedTemplate.id,
      name: configure ? name.trim() || selectedTemplate.name : selectedTemplate.name,
      domain: selectedTemplate.domain,
      ruleMode: configure ? ruleMode : (selectedTemplate.ruleMode || "guided"),
      templateOptions: { includeCache: configure && selectedTemplate.id === "system-design.general" && includeCache },
    });
  };

  return (
    <main className={`design-studio-screen${isDarkTheme ? " design-studio-dark" : ""}`} aria-labelledby="design-studio-title">
      <header className="design-studio-topbar">
        <div className="design-studio-brand"><span className="design-studio-brand-mark" aria-hidden="true">S</span><span>Sketchizi</span><span className="design-studio-brand-divider">/</span><span className="design-studio-brand-subtitle">Design Studio</span></div>
        <button type="button" className="design-studio-back-button" onClick={onClose}>Back to editor</button>
      </header>

      <section className="design-studio-intro">
        <p className="design-studio-eyebrow">DESIGN STUDIO</p>
        <h1 id="design-studio-title">What are you designing?</h1>
        <p>Start with a blank canvas or choose a reusable starting point. You can change any design after opening it.</p>
      </section>

      <section className="design-studio-blank-card" aria-label="Start with a blank canvas">
        <div className="design-studio-blank-icon" aria-hidden="true">＋</div>
        <div className="design-studio-blank-copy"><h2>Blank canvas</h2><p>Start from scratch with no template rules or predefined components.</p></div>
        <button type="button" className="design-studio-secondary-action" onClick={startBlank}>Start blank</button>
      </section>

      <section className="design-studio-catalog" aria-label="Design templates">
        <div className="design-studio-catalog-heading"><div><h2>Explore starting points</h2><p>Choose a category, then select a template.</p></div><label className="design-studio-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" aria-label="Search templates" /></label></div>
        <div className="design-studio-category-tabs" role="tablist" aria-label="Template categories">
          {CATEGORIES.map((item) => <button type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
        </div>

        {category === "aws" && !templates.some((template) => template.domain === "cloud-infrastructure" || template.id.startsWith("aws.")) ? (
          <div className="design-studio-empty-category"><span className="design-studio-empty-icon" aria-hidden="true">☁</span><h3>AWS architecture starters are next</h3><p>The catalog foundation is ready. AWS-specific starters will be added after this creation workflow is integrated and verified.</p></div>
        ) : visibleTemplates.length === 0 ? (
          <div className="design-studio-empty-category"><h3>No matching templates</h3><p>Try another search or choose a different category.</p></div>
        ) : (
          <div className="design-studio-template-grid">
            {visibleTemplates.map((template) => <button type="button" key={template.id} className={`design-studio-template-card${selectedId === template.id ? " selected" : ""}`} onClick={() => { setSelectedId(template.id); setName(template.name); setRuleMode(template.ruleMode || "guided"); setIncludeCache(false); }} aria-pressed={selectedId === template.id}>
              <TemplatePreview template={template} />
              <span className="design-studio-template-meta"><span>{template.category}</span>{selectedId === template.id && <span className="design-studio-selected-mark" aria-label="Selected">✓</span>}</span>
              <strong>{template.name}</strong><small>{template.description}</small>
            </button>)}
          </div>
        )}
      </section>

      {selectedTemplate && (
        <section className="design-studio-selection-bar" aria-label="Selected template actions">
          <div className="design-studio-selection-summary"><strong>{selectedTemplate.name}</strong><span>{selectedTemplate.description}</span></div>
          <label className="design-studio-configure-toggle"><input type="checkbox" checked={configure} onChange={(event) => setConfigure(event.target.checked)} /><span>Configure first</span></label>
          {configure && <div className="design-studio-config-fields"><label>Design name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label>Validation mode<select value={ruleMode} onChange={(event) => setRuleMode(event.target.value)}><option value="guided">Guided — suggestions and warnings</option><option value="strict">Strict — violations are errors</option></select></label>{selectedTemplate.id === "system-design.general" && <label className="design-studio-config-option"><span>Optional components</span><span><input type="checkbox" checked={includeCache} onChange={(event) => setIncludeCache(event.target.checked)} /> Include a cache between the API service and database</span></label>}</div>}
          <button type="button" className="design-studio-primary-action" onClick={startSelected}>Use template <span aria-hidden="true">→</span></button>
        </section>
      )}
    </main>
  );
}
