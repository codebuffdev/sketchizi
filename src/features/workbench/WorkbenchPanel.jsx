import { useEffect, useState } from "react";
import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS, WORKBENCH_VIEWS } from "./workbenchRegistry.js";
import { validateRelationEndpoints } from "./workbenchModel.js";
import SimulationExperimentPanel from "../simulation/experiments/SimulationExperimentPanel.jsx";
import PolicyApprovalPanel from "./PolicyApprovalPanel.jsx";
import { validateWorkbench } from "./workbenchValidation.js";
import { generateOpenApiArtifact, generateSqlArtifact } from "./workbenchArtifacts.js";

function downloadWorkbenchArtifact(artifact) {
  if (!artifact?.ok || !artifact.text || typeof document === "undefined") return;
  const blob = new Blob([artifact.text], { type: artifact.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = "noopener";
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
}

export default function WorkbenchPanel({
  workbench,
  isOpen,
  onClose,
  onInitialize,
  onCreatePoc,
  onCompletePocArtifacts,
  onSwitchView,
  onAddComponent,
  onUpdateEntity,
  onCreateRelation,
  onCreateRelationBetween,
  onFocusFinding,
  selectedEntity = null,
  visibleEntityIds = [],
  inspectorError = "",
  busy = false,
  canEdit = true,
  simulationProfile = null,
  onUpdateSimulationProfile,
  simulationHistory = [],
  onUpdateSimulationHistory,
  onUpdateArchitectureDecisionRecords,
  onUpdatePolicyGovernance,
  onRuntimeOverlayChange,
}) {
  const [relationKind, setRelationKind] = useState("calls");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [generatedArtifact, setGeneratedArtifact] = useState(null);
  const [showPocPreview, setShowPocPreview] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState("build");
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [artifactPreviewExpanded, setArtifactPreviewExpanded] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");
  const [expandedComponentGroups, setExpandedComponentGroups] = useState({ Application: true, Data: true });
  useEffect(() => {
    const available = selectedEntity ? WORKBENCH_RELATIONS.filter((item) => item.sourceKinds.includes(selectedEntity.kind)) : [];
    if (!available.some((item) => item.kind === relationKind)) setRelationKind(available[0]?.kind || "depends-on");
    setRelationTargetId("");
  }, [selectedEntity?.id, selectedEntity?.kind]);
  if (!isOpen) return null;
  const activeViewId = workbench?.activeViewId || "system";
  const availableViews = WORKBENCH_VIEWS.map((definition) => ({ ...definition, ...(workbench?.views || []).find((view) => view.id === definition.id) }));
  const currentView = availableViews.find((view) => view.id === activeViewId);
  const findings = validateWorkbench(workbench);
  const findingErrors = findings.filter((finding) => finding.severity === "error").length;
  const findingWarnings = findings.filter((finding) => finding.severity === "warning").length;
  const normalizedComponentSearch = componentSearch.trim().toLowerCase();
  const viewScopedComponents = activeViewId === "lld"
    ? WORKBENCH_COMPONENTS.filter((component) => component.designLevel === "lld")
    : activeViewId === "system"
      ? WORKBENCH_COMPONENTS.filter((component) => component.designLevel !== "lld")
      : activeViewId === "apis"
        ? WORKBENCH_COMPONENTS.filter((component) => component.kind.startsWith("backend.") && ["backend.rest-service", "backend.api-endpoint", "backend.rest-controller", "backend.java-interface", "backend.java-class"].includes(component.kind))
        : activeViewId === "data"
          ? WORKBENCH_COMPONENTS.filter((component) => component.kind.startsWith("data.") || component.kind === "design.domain-entity" || component.kind === "messaging.queue" || component.kind === "backend.repository")
          : WORKBENCH_COMPONENTS.filter((component) => component.kind === "devops.deployment-target" || component.designLevel === "hld");
  const filteredComponents = viewScopedComponents.filter((component) => !normalizedComponentSearch ||
    `${component.label} ${component.details} ${component.group} ${component.kind}`.toLowerCase().includes(normalizedComponentSearch));
  const grouped = filteredComponents.reduce((groups, component) => {
    (groups[component.group] ||= []).push(component);
    return groups;
  }, {});
  const artifactStale = Boolean(generatedArtifact && generatedArtifact.modelRevision !== (workbench?.modelRevision ?? 0));
  const pocEndpoints = (workbench?.entities || []).filter((entity) => entity.kind === "backend.api-endpoint");
  const pocTables = (workbench?.entities || []).filter((entity) => entity.kind === "data.postgresql-table");
  const needsPocArtifactScaffolding = workbench?.pocTemplate?.id === "react-rest-postgresql" && (
    pocEndpoints.length === 0 || pocTables.length === 0
    || (pocEndpoints.length === 1 && !workbench.relations.some((relation) => relation.kind === "exposes" && relation.targetId === pocEndpoints[0].id))
    || (pocTables.length === 1 && !workbench.relations.some((relation) => relation.kind === "contains-table" && relation.targetId === pocTables[0].id))
  );
  const generateArtifact = (generator) => {
    try {
      setGeneratedArtifact(generator(workbench));
      setArtifactPreviewExpanded(false);
    } catch (error) {
      setGeneratedArtifact({
        kind: "error", filename: "", mimeType: "text/plain;charset=utf-8", ok: false,
        modelRevision: workbench?.modelRevision ?? 0, text: "", value: null, warnings: [],
        errors: [{ code: "artifact.generator-error", severity: "error", message: error?.message || "Artifact generation failed." }],
      });
    }
  };
  const changePanelTab = (tab, targetId = null) => {
    setActivePanelTab(tab);
    globalThis.requestAnimationFrame?.(() => {
      if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      else document.querySelector(".workbench-task-tabs")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  return (
    <section className="workbench-panel" aria-label="Engineering Workbench">
      <header className="workbench-panel-header">
        <div className="workbench-panel-brand">
          <span className="workbench-mark" aria-hidden="true">W</span>
          <div>
            <strong>Engineering Workbench</strong>
            <span>{workbench ? "Connected engineering model" : "Early access · experimental"}</span>
          </div>
        </div>
        <button type="button" className="workbench-close" onClick={onClose} aria-label="Close Engineering Workbench" title="Close Workbench">×</button>
      </header>

      {!workbench ? (
        <div className="workbench-panel-scroll">
          <div className="workbench-welcome">
          <div className="workbench-eyebrow">DESIGN · VALIDATE · SIMULATE</div>
          <h2>Turn your drawing into an engineering model.</h2>
          <p>Enable Workbench to add typed components, maintain linked views, review architecture findings, and run explicitly configured synthetic experiments.</p>
          <button type="button" className="workbench-primary" disabled={!canEdit || busy} onClick={onInitialize}>Enable Workbench</button>
          <p className="workbench-note">Your existing shapes and icons remain visual-only. Enabling Workbench does not convert them.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="workbench-panel-scroll">
          <div className="workbench-section">
            <div className="workbench-section-heading"><span>DESIGN PERSPECTIVES</span><span className="workbench-count">{workbench.views.length}</span></div>
            <div className="workbench-view-list" role="tablist" aria-label="Workbench views">
              {availableViews.map((view) => (
                <button
                  type="button"
                  role="tab"
                  key={view.id}
                  aria-selected={view.id === activeViewId}
                  className={view.id === activeViewId ? "workbench-view active" : "workbench-view"}
                  disabled={!canEdit || busy || view.id === activeViewId}
                  onClick={() => onSwitchView(view.id)}
                >
                  <span className={`workbench-view-icon workbench-view-${view.id}`} aria-hidden="true">{({ system: "◈", apis: "⇄", data: "▤", deployment: "⌘", lld: "{}" })[view.id] || "◇"}</span>
                  <span className="workbench-view-copy"><strong>{view.label}</strong><small>{view.description}</small></span>
                  {view.id === activeViewId && <span className="workbench-active-dot" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <p className="workbench-note workbench-view-context" title="The engineering model is shared across views; each view has its own canvas layout.">Active view: {currentView?.label || "System"} · shared model</p>
            <div className="workbench-design-level-summary">
              <span className="workbench-level-kicker">CURRENT DESIGN LEVEL</span>
              <strong>{activeViewId === "lld" ? "Low-level design" : activeViewId === "system" ? "High-level design" : currentView?.label || "Design view"}</strong>
              <small>{activeViewId === "lld" ? "Model classes, interfaces, controllers and repositories." : activeViewId === "system" ? "Model system boundaries, services and infrastructure." : `Design perspective: ${currentView?.label || "current view"}.`}</small>
            </div>
            {activeViewId === "system" && <p className="workbench-level-hint"><strong>HLD</strong> Define system boundaries and how major services communicate. Select a service to inspect its responsibilities.</p>}
            {activeViewId === "lld" && <div className="workbench-lld-start-card">
              <div className="workbench-lld-start-heading"><span className="workbench-lld-start-icon" aria-hidden="true">{ }</span><div><strong>Design inside a service</strong><small>Build implementation details, not another system map.</small></div></div>
              <p>Add controllers, Java classes, interfaces, repositories, API contracts and domain entities. Use typed relationships to describe how they work together.</p>
              <button type="button" className="workbench-primary" disabled={!canEdit || busy} onClick={() => changePanelTab("components")}>＋ Add a design element</button>
              <button type="button" className="workbench-secondary workbench-lld-back-button" onClick={() => onSwitchView("system")}>← Return to system architecture</button>
            </div>}
          </div>


          {workbench.entities.length === 0 && workbench.relations.length === 0 && activePanelTab !== "build" && (
            <section className="workbench-section workbench-empty-design" aria-label="Start an HLD and LLD design">
              <div className="workbench-empty-design-mark" aria-hidden="true">◇</div>
              <div className="workbench-section-heading"><span>START YOUR DESIGN</span><span className="workbench-count">HLD · LLD</span></div>
              <h2>No architecture model yet</h2>
              <p className="workbench-section-intro">Start with a connected system architecture, then add API contracts, database tables, and detailed component properties. The model is shared across Workbench views.</p>
              <button
                type="button"
                className="workbench-primary"
                disabled={!canEdit || busy}
                onClick={() => activeViewId === "system" ? onCreatePoc?.() : onSwitchView?.("system")}
              >
                {activeViewId === "system" ? (busy ? "Creating architecture…" : "Create starter architecture") : "Go to System view to start"}
              </button>
              <button type="button" className="workbench-secondary workbench-empty-browse" onClick={() => changePanelTab("components")}>Or build from components</button>
              <p className="workbench-note">This creates a starter model, not a production-ready design. You can edit it and expand it to match your system.</p>
            </section>
          )}

          <nav className="workbench-task-tabs" role="tablist" aria-label="Workbench workspace">
            <button type="button" role="tab" aria-selected={activePanelTab === "build"} className={activePanelTab === "build" ? "active" : ""} onClick={() => changePanelTab("build")}><span aria-hidden="true">◇</span>Design</button>
            <button type="button" role="tab" aria-selected={activePanelTab === "run"} className={activePanelTab === "run" ? "active" : ""} onClick={() => changePanelTab("run")}><span aria-hidden="true">▷</span>Simulate</button>
            <button type="button" role="tab" aria-selected={activePanelTab === "components"} className={activePanelTab === "components" ? "active" : ""} onClick={() => changePanelTab("components")}><span aria-hidden="true">＋</span>Add elements</button>
            <button type="button" role="tab" aria-selected={activePanelTab === "inspect"} className={activePanelTab === "inspect" ? "active" : ""} onClick={() => changePanelTab("inspect")}><span aria-hidden="true">☷</span>Properties</button>
            <button type="button" role="tab" aria-selected={activePanelTab === "policy"} className={activePanelTab === "policy" ? "active" : ""} onClick={() => changePanelTab("policy")}><span aria-hidden="true">✓</span>Policy</button>
          </nav>
          <div hidden={activePanelTab !== "build"} className="workbench-task-pane" role="tabpanel" aria-label="Design, review and artifacts">
          {activeViewId === "system" && workbench.entities.length === 0 && workbench.relations.length === 0 && (
            <section className="workbench-section workbench-poc-template" aria-label="Create a POC from a template">
              <div className="workbench-section-heading"><span>START WITH A POC</span><span className="workbench-count">1</span></div>
              <h2>Web application with database</h2>
              <p className="workbench-section-intro">Create a connected React, REST, and PostgreSQL model, including a starter API contract and table schema for immediate OpenAPI and SQL previews.</p>
              <div className="workbench-poc-path" aria-label="Template architecture">
                <span>React application</span><span aria-hidden="true">→</span><span>REST service</span><span aria-hidden="true">→</span><span>PostgreSQL</span>
              </div>
              <div className="workbench-artifact-actions">
                <button type="button" className="workbench-primary" disabled={!canEdit || busy || activeViewId !== "system"} onClick={onCreatePoc}>{busy ? "Creating POC…" : "Create POC"}</button>
                <button type="button" className="workbench-secondary" onClick={() => setShowPocPreview((value) => !value)} aria-expanded={showPocPreview}>{showPocPreview ? "Hide preview" : "Preview architecture"}</button>
              </div>
              {activeViewId !== "system" && <p className="workbench-note">Switch to the System view before creating the template.</p>}
              {showPocPreview && <div className="workbench-poc-preview">
                <strong>Runtime components</strong>
                <ul><li>React application — traffic source</li><li>REST service — request processing</li><li>PostgreSQL — relational data store</li></ul>
                <strong>Starter contract and schema</strong>
                <ul><li><code>GET /api/items</code> — OpenAPI endpoint</li><li><code>items</code> — PostgreSQL table with ID, name, and creation timestamp</li></ul>
                <strong>Typed relationships</strong>
                <ul><li>React application <b>Calls</b> REST service</li><li>REST service <b>Reads from</b> PostgreSQL</li><li>REST service <b>Exposes API</b> endpoint</li><li>PostgreSQL <b>Contains table</b> items</li></ul>
                <p>Profiles start with illustrative synthetic assumptions. Review and acknowledge them before running experiments.</p>
              </div>}
              <p className="workbench-note">Your existing freeform drawing is retained. The template creates semantic entities and typed relationships; it does not overwrite visual-only shapes.</p>
            </section>
          )}
          {workbench.pocTemplate?.id === "react-rest-postgresql" && (
            <section className="workbench-section workbench-poc-status" aria-label="POC workflow">
              <div className="workbench-section-heading"><span>POC WORKFLOW</span><span className="workbench-count">3</span></div>
              <strong>Full-stack POC created</strong>
              <p className="workbench-poc-path">React application <span aria-hidden="true">→</span> REST service <span aria-hidden="true">→</span> PostgreSQL</p>
              {needsPocArtifactScaffolding ? <div className="workbench-poc-upgrade">
                <p className="workbench-note">This POC was created before the starter API contract and SQL table were included.</p>
                <button type="button" className="workbench-secondary" disabled={!canEdit || busy || activeViewId !== "system"} onClick={onCompletePocArtifacts}>{busy ? "Adding starter artifacts…" : "Add starter API + table"}</button>
              </div> : <p className="workbench-note">Includes <code>GET /api/items</code> and an <code>items</code> table, so OpenAPI and SQL previews have a valid starting point.</p>}
              <div className="workbench-poc-steps">
                <button type="button" onClick={() => { changePanelTab("inspect"); const entity = workbench.entities.find((item) => item.kind === "frontend.react-app") || workbench.entities[0]; if (entity) onFocusFinding?.({ entityIds: [entity.id] }); }}>1. Configure</button>
                <button type="button" onClick={() => { setReviewExpanded(true); changePanelTab("build", "workbench-model-review"); }}>2. Validate</button>
                <button type="button" onClick={() => changePanelTab("run", "workbench-experiments")}>3. Experiment & debug</button>
              </div>
              <p className="workbench-note">Review the synthetic assumptions in Experiments and explicitly confirm them before running.</p>
            </section>
          )}

          <section id="workbench-model-review" className="workbench-section workbench-findings" aria-label="Architecture validation" aria-live="polite">
            <button type="button" className="workbench-disclosure-trigger" aria-expanded={reviewExpanded} onClick={() => setReviewExpanded((value) => !value)}>
              <span className="workbench-disclosure-title">MODEL REVIEW</span>
              <span className="workbench-review-status">
                <span className={`workbench-severity ${findingErrors ? "error" : "clear"}`}>{findingErrors} errors</span>
                <span className={`workbench-severity ${findingWarnings ? "warning" : "clear"}`}>{findingWarnings} warnings</span>
              </span>
              <span className={`workbench-disclosure-chevron ${reviewExpanded ? "expanded" : ""}`} aria-hidden="true">⌄</span>
            </button>
            {reviewExpanded && <div className="workbench-review-content">
              {findings.length === 0 ? (
                <p className="workbench-findings-empty">No semantic findings. The model passes the checks available in this prototype; this does not certify runtime behavior.</p>
              ) : (
                <div className="workbench-finding-list">
                  {findings.slice(0, 8).map((finding) => (
                    <button key={finding.id} type="button" className={`workbench-finding ${finding.severity}`} onClick={() => onFocusFinding?.(finding)} title={finding.message}>
                      <span className={`workbench-finding-marker ${finding.severity}`} aria-hidden="true">{finding.severity === "error" ? "!" : "i"}</span>
                      <span className="workbench-finding-copy"><strong>{finding.title}</strong><small>{finding.message}</small>{finding.suggestedAction && <em>{finding.suggestedAction}</em>}</span>
                    </button>
                  ))}
                  {findings.length > 8 && <p className="workbench-findings-more">Showing 8 of {findings.length} findings.</p>}
                </div>
              )}
            </div>}
          </section>

          <section id="workbench-artifacts" className="workbench-section workbench-artifacts" aria-label="Generated engineering artifacts">
            <div className="workbench-section-heading"><span>ARTIFACTS</span><span className="workbench-count">2</span></div>
            <p className="workbench-section-intro">Generate reviewable OpenAPI and PostgreSQL DDL previews from the semantic model. Generation never deploys or changes your design.</p>
            <div className="workbench-artifact-actions">
              <button type="button" className="workbench-primary" onClick={() => generateArtifact(generateOpenApiArtifact)}>Generate OpenAPI</button>
              <button type="button" className="workbench-secondary" onClick={() => generateArtifact(generateSqlArtifact)}>Generate SQL</button>
            </div>
            {generatedArtifact && (
              <div className={`workbench-artifact-result ${generatedArtifact.ok ? "success" : "error"}`} aria-live="polite">
                <strong>{generatedArtifact.ok ? `${generatedArtifact.filename} preview ready` : `${generatedArtifact.kind === "sql" ? "SQL" : generatedArtifact.kind === "openapi" ? "OpenAPI" : "Artifact"} generation needs attention`}</strong>
                {artifactStale && <p className="workbench-artifact-stale" role="status">The model changed after this preview was generated. Regenerate it before downloading.</p>}
                {generatedArtifact.errors?.length > 0 && <ul className="workbench-artifact-diagnostics">{generatedArtifact.errors.map((item, index) => <li key={`${item.code || "error"}-${index}`}>{item.message}</li>)}</ul>}
                {generatedArtifact.warnings?.length > 0 && <ul className="workbench-artifact-warnings">{generatedArtifact.warnings.map((item, index) => <li key={`${item.code || "warning"}-${index}`}>{item.message}</li>)}</ul>}
                {generatedArtifact.ok && <>
                  <div className="workbench-artifact-actions">
                    <button type="button" className="workbench-secondary" disabled={artifactStale} onClick={() => downloadWorkbenchArtifact(generatedArtifact)}>Download {generatedArtifact.filename}</button>
                    <button type="button" className="workbench-secondary" onClick={() => setArtifactPreviewExpanded((value) => !value)} aria-expanded={artifactPreviewExpanded}>{artifactPreviewExpanded ? "Hide preview" : "View preview"}</button>
                    <button type="button" className="workbench-secondary" onClick={() => { setGeneratedArtifact(null); setArtifactPreviewExpanded(false); }}>Dismiss</button>
                  </div>
                  {artifactPreviewExpanded && <pre className="workbench-artifact-preview">{generatedArtifact.text}</pre>}
                </>}
              </div>
            )}
            <p className="workbench-note">OpenAPI requires API endpoint components connected to exactly one REST service. SQL requires PostgreSQL table components connected to a database. Outputs must be reviewed and tested before use.</p>
          </section>

          </div>

          <div hidden={activePanelTab !== "run"} className="workbench-task-pane" role="tabpanel" aria-label="Simulation and exploration">
          <SimulationExperimentPanel
            workbench={workbench}
            visibleEntityIds={visibleEntityIds}
            activeViewId={activeViewId}
            onSwitchView={onSwitchView}
            onSwitchToAdd={() => changePanelTab("components")}
            simulationProfile={simulationProfile}
            onUpdateSimulationProfile={onUpdateSimulationProfile}
            onUpdateEntity={onUpdateEntity}
            simulationHistory={simulationHistory}
            onUpdateSimulationHistory={onUpdateSimulationHistory}
            onUpdateArchitectureDecisionRecords={onUpdateArchitectureDecisionRecords}
            onRuntimeOverlayChange={onRuntimeOverlayChange}
            onCreateTypedRelation={onCreateRelationBetween}
            onFocusEntity={(entityId) => onFocusFinding?.({ entityIds: [entityId] })}
            canEdit={canEdit}
          />

          </div>

          <div hidden={activePanelTab !== "components"} className="workbench-task-pane" role="tabpanel" aria-label="Add components">
          <div className="workbench-section workbench-components-section">
            <div className="workbench-section-heading"><span>COMPONENT CATALOG</span><span className="workbench-count">{filteredComponents.length}</span></div>
            <p className="workbench-section-intro">Search by component or browse a category. Additions become part of the shared semantic model.</p>
            <label className="workbench-component-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={componentSearch} onChange={(event) => setComponentSearch(event.target.value)} placeholder="Search components…" aria-label="Search components" />
              {componentSearch && <button type="button" onClick={() => setComponentSearch("")} aria-label="Clear component search">×</button>}
            </label>
            {Object.entries(grouped).map(([group, components]) => {
              const expanded = Boolean(normalizedComponentSearch || expandedComponentGroups[group]);
              return <section className="workbench-component-group" key={group}>
                {normalizedComponentSearch ? <div className="workbench-component-group-trigger workbench-component-group-label" aria-label={`${group} search results`}>
                  <span>{group}</span><small>{components.length}</small>
                </div> : <button type="button" className="workbench-component-group-trigger" aria-expanded={expanded} onClick={() => setExpandedComponentGroups((current) => ({ ...current, [group]: !current[group] }))}>
                  <span>{group}</span><small>{components.length}</small><span className={`workbench-component-group-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">⌄</span>
                </button>}
                {expanded && <div className="workbench-component-list">
                  {components.map((component) => (
                    <button type="button" className="workbench-component" key={component.kind} disabled={!canEdit || busy} onClick={() => onAddComponent(component.kind)} title={component.details}>
                      <span className="workbench-component-symbol" style={{ "--component-fill": component.fill, "--component-stroke": component.stroke }} aria-hidden="true"><span /></span>
                      <span className="workbench-component-copy"><strong>{component.label}</strong><small>{component.details}</small></span>
                      <span className="workbench-component-add" aria-hidden="true">+</span>
                    </button>
                  ))}
                </div>}
              </section>;
            })}
            {filteredComponents.length === 0 && <div className="workbench-catalog-empty"><strong>No components found</strong><p>Try a different name or category.</p><button type="button" className="workbench-secondary" onClick={() => setComponentSearch("")}>Clear search</button></div>}
          </div>

          </div>

          <div hidden={activePanelTab !== "policy"} className="workbench-task-pane" role="tabpanel" aria-label="Policy approval">
            <PolicyApprovalPanel
              policyGovernance={workbench?.policyGovernance || { policyHistory: [], approvalEvents: [] }}
              onUpdatePolicyGovernance={onUpdatePolicyGovernance}
              canEdit={canEdit}
            />
          </div>

          <div hidden={activePanelTab !== "inspect"} className="workbench-task-pane" role="tabpanel" aria-label="Inspect component">
          <section id="workbench-inspector" className="workbench-section workbench-inspector" aria-label="Component inspector">
            <div className="workbench-section-heading"><span>INSPECTOR</span><span className="workbench-count">{selectedEntity ? "1" : "0"}</span></div>
            {!selectedEntity ? (
              <div className="workbench-inspector-empty">
                <span className="workbench-inspector-empty-icon" aria-hidden="true">◇</span>
                <strong>No component selected</strong>
                <p>Select a component on the canvas to edit its properties or create a typed relationship.</p>
                <button type="button" className="workbench-secondary" onClick={() => changePanelTab("components")}>Browse components</button>
                {activeViewId !== "system" && <button type="button" className="workbench-secondary" onClick={() => onSwitchView?.("system")}>Go to System view</button>}
              </div>
            ) : (() => {
              const definition = WORKBENCH_COMPONENTS.find((item) => item.kind === selectedEntity.kind);
              const possibleRelations = WORKBENCH_RELATIONS.filter((item) => item.sourceKinds.includes(selectedEntity.kind));
              const activeRelation = WORKBENCH_RELATIONS.find((item) => item.kind === relationKind) || possibleRelations[0];
              const targets = workbench.entities.filter((entity) => visibleEntityIds.includes(entity.id) && entity.id !== selectedEntity.id && activeRelation?.targetKinds.includes(entity.kind));
              const target = targets.find((entity) => entity.id === relationTargetId);
              const valid = target ? validateRelationEndpoints(activeRelation.kind, selectedEntity, target).valid : false;
              return <div className="workbench-inspector-body">
                <div className="workbench-inspector-kind">{definition?.label || selectedEntity.kind}</div>
                <label className="workbench-field"><span>Component name</span><input value={selectedEntity.name || ""} disabled={!canEdit} maxLength={120} onChange={(event) => onUpdateEntity?.(selectedEntity.id, { name: event.target.value })} /></label>
                {(definition?.properties || []).map((property) => {
                  const value = selectedEntity.properties?.[property.key] ?? property.defaultValue ?? "";
                  return <label className={`workbench-field ${property.type === "json" ? "workbench-json-field" : ""}`} key={property.key}><span>{property.label}</span>{property.type === "select" ? <select value={value} disabled={!canEdit} onChange={(event) => onUpdateEntity?.(selectedEntity.id, { properties: { [property.key]: event.target.value } })}>{property.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : property.type === "json" ? <textarea rows={6} spellCheck={false} value={value} disabled={!canEdit} onChange={(event) => onUpdateEntity?.(selectedEntity.id, { properties: { [property.key]: event.target.value } })} aria-label={property.label} /> : <input type={property.type === "number" ? "number" : "text"} min={property.min} max={property.max} value={value} disabled={!canEdit} onChange={(event) => onUpdateEntity?.(selectedEntity.id, { properties: { [property.key]: property.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value } })} />}</label>;
                })}
                <div className="workbench-relation-heading">Create relationship</div>
                <label className="workbench-field"><span>Relationship</span><select disabled={!canEdit || !possibleRelations.length} value={activeRelation?.kind || ""} onChange={(event) => { setRelationKind(event.target.value); setRelationTargetId(""); }}>{possibleRelations.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label>
                <label className="workbench-field"><span>Target component</span><select disabled={!canEdit || !targets.length} value={relationTargetId} onChange={(event) => setRelationTargetId(event.target.value)}><option value="">Choose target…</option>{targets.map((entity) => <option key={entity.id} value={entity.id}>{entity.name} · {WORKBENCH_COMPONENTS.find((item) => item.kind === entity.kind)?.label || entity.kind}</option>)}</select></label>
                {activeRelation && <p className="workbench-field-help">{activeRelation.description}</p>}
                <button type="button" className="workbench-primary workbench-create-relation" disabled={!canEdit || busy || !valid} onClick={() => onCreateRelation?.({ kind: activeRelation.kind, targetId: relationTargetId })}>Create typed relationship</button>
                <div className="workbench-existing-relations">
                  <strong>Connected relationships</strong>
                  {workbench.relations.filter((relation) => relation.sourceId === selectedEntity.id || relation.targetId === selectedEntity.id).length === 0
                    ? <p>No typed relationships yet.</p>
                    : workbench.relations.filter((relation) => relation.sourceId === selectedEntity.id || relation.targetId === selectedEntity.id).map((relation) => {
                      const source = workbench.entities.find((entity) => entity.id === relation.sourceId);
                      const target = workbench.entities.find((entity) => entity.id === relation.targetId);
                      const relationLabel = WORKBENCH_RELATIONS.find((item) => item.kind === relation.kind)?.label || relation.kind;
                      return <div className="workbench-existing-relation" key={relation.id}><span>{source?.name || relation.sourceId}</span><small>{relationLabel}</small><span>{target?.name || relation.targetId}</span></div>;
                    })}
                </div>
                {inspectorError && <p className="workbench-inspector-error" role="alert">{inspectorError}</p>}
              </div>;
            })()}
          </section>
          </div>

          </div>

          <footer className="workbench-panel-footer">
            <div><strong>{workbench.entities.length}</strong> semantic components <span>·</span> <strong>{workbench.relations.length}</strong> relations</div>
            <p>Model revision {workbench.modelRevision}. Relationship types are checked against component kinds.</p>
          </footer>
        </>
      )}
    </section>
  );
}
