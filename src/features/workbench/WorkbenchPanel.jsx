import { useEffect, useState } from "react";
import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS, WORKBENCH_VIEWS } from "./workbenchRegistry.js";
import { validateRelationEndpoints } from "./workbenchModel.js";
import SimulationExperimentPanel from "../simulation/experiments/SimulationExperimentPanel.jsx";
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
}) {
  const [relationKind, setRelationKind] = useState("calls");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [generatedArtifact, setGeneratedArtifact] = useState(null);
  const [showPocPreview, setShowPocPreview] = useState(false);
  useEffect(() => {
    const available = selectedEntity ? WORKBENCH_RELATIONS.filter((item) => item.sourceKinds.includes(selectedEntity.kind)) : [];
    if (!available.some((item) => item.kind === relationKind)) setRelationKind(available[0]?.kind || "depends-on");
    setRelationTargetId("");
  }, [selectedEntity?.id, selectedEntity?.kind]);
  if (!isOpen) return null;
  const activeViewId = workbench?.activeViewId || "system";
  const currentView = (workbench?.views || WORKBENCH_VIEWS).find((view) => view.id === activeViewId);
  const findings = validateWorkbench(workbench);
  const findingErrors = findings.filter((finding) => finding.severity === "error").length;
  const findingWarnings = findings.filter((finding) => finding.severity === "warning").length;
  const grouped = WORKBENCH_COMPONENTS.reduce((groups, component) => {
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
    } catch (error) {
      setGeneratedArtifact({
        kind: "error", filename: "", mimeType: "text/plain;charset=utf-8", ok: false,
        modelRevision: workbench?.modelRevision ?? 0, text: "", value: null, warnings: [],
        errors: [{ code: "artifact.generator-error", severity: "error", message: error?.message || "Artifact generation failed." }],
      });
    }
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
            <div className="workbench-section-heading"><span>VIEWS</span><span className="workbench-count">{workbench.views.length}</span></div>
            <div className="workbench-view-list" role="tablist" aria-label="Workbench views">
              {(workbench.views || WORKBENCH_VIEWS).map((view) => (
                <button
                  type="button"
                  role="tab"
                  key={view.id}
                  aria-selected={view.id === activeViewId}
                  className={view.id === activeViewId ? "workbench-view active" : "workbench-view"}
                  disabled={!canEdit || busy || view.id === activeViewId}
                  onClick={() => onSwitchView(view.id)}
                >
                  <span className={`workbench-view-icon workbench-view-${view.id}`} aria-hidden="true">{({ system: "◈", apis: "⇄", data: "▤", deployment: "⌘" })[view.id] || "◇"}</span>
                  <span className="workbench-view-copy"><strong>{view.label}</strong><small>{view.description}</small></span>
                  {view.id === activeViewId && <span className="workbench-active-dot" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <p className="workbench-note">Active view: {currentView?.label || "System"}. The model is shared; each view has its own canvas layout.</p>
          </div>

          {workbench.entities.length === 0 && workbench.relations.length === 0 && (
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
                <button type="button" onClick={() => document.getElementById("workbench-inspector")?.scrollIntoView({ behavior: "smooth", block: "start" })}>1. Configure</button>
                <button type="button" onClick={() => document.getElementById("workbench-model-review")?.scrollIntoView({ behavior: "smooth", block: "start" })}>2. Validate</button>
                <button type="button" onClick={() => document.getElementById("workbench-experiments")?.scrollIntoView({ behavior: "smooth", block: "start" })}>3. Experiment & debug</button>
              </div>
              <p className="workbench-note">Review the synthetic assumptions in Experiments and explicitly confirm them before running.</p>
            </section>
          )}

          <section id="workbench-model-review" className="workbench-section workbench-findings" aria-label="Architecture validation" aria-live="polite">
            <div className="workbench-section-heading"><span>MODEL REVIEW</span><span className="workbench-count">{findings.length}</span></div>
            <div className="workbench-findings-summary">
              <span className={findingErrors ? "workbench-severity error" : "workbench-severity clear"}>{findingErrors} errors</span>
              <span className={findingWarnings ? "workbench-severity warning" : "workbench-severity clear"}>{findingWarnings} warnings</span>
            </div>
            {findings.length === 0 ? (
              <p className="workbench-findings-empty">No semantic findings. This means the current model passes the checks available in this prototype; it does not certify runtime behavior.</p>
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
                    <button type="button" className="workbench-secondary" onClick={() => setGeneratedArtifact(null)}>Dismiss</button>
                  </div>
                  <pre className="workbench-artifact-preview">{generatedArtifact.text}</pre>
                </>}
              </div>
            )}
            <p className="workbench-note">OpenAPI requires API endpoint components connected to exactly one REST service. SQL requires PostgreSQL table components connected to a database. Outputs must be reviewed and tested before use.</p>
          </section>

          <SimulationExperimentPanel
            workbench={workbench}
            visibleEntityIds={visibleEntityIds}
            simulationProfile={simulationProfile}
            onUpdateSimulationProfile={onUpdateSimulationProfile}
            simulationHistory={simulationHistory}
            onUpdateSimulationHistory={onUpdateSimulationHistory}
            onCreateTypedRelation={onCreateRelationBetween}
            onFocusEntity={(entityId) => onFocusFinding?.({ entityIds: [entityId] })}
            canEdit={canEdit}
          />

          <div className="workbench-section workbench-components-section">
            <div className="workbench-section-heading"><span>COMPONENTS</span><span className="workbench-count">{workbench.entities.length}</span></div>
            <p className="workbench-section-intro">Insert a typed component into the active view. These components become part of the document's semantic model.</p>
            {Object.entries(grouped).map(([group, components]) => (
              <div className="workbench-component-group" key={group}>
                <h3>{group}</h3>
                <div className="workbench-component-list">
                  {components.map((component) => (
                    <button type="button" className="workbench-component" key={component.kind} disabled={!canEdit || busy} onClick={() => onAddComponent(component.kind)} title={component.details}>
                      <span className="workbench-component-symbol" style={{ "--component-fill": component.fill, "--component-stroke": component.stroke }} aria-hidden="true"><span /></span>
                      <span className="workbench-component-copy"><strong>{component.label}</strong><small>{component.details}</small></span>
                      <span className="workbench-component-add" aria-hidden="true">+</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <section id="workbench-inspector" className="workbench-section workbench-inspector" aria-label="Component inspector">
            <div className="workbench-section-heading"><span>INSPECTOR</span><span className="workbench-count">{selectedEntity ? "1" : "0"}</span></div>
            {!selectedEntity ? (
              <p className="workbench-section-intro">Select a Workbench component on the canvas to inspect its properties or create a typed relationship.</p>
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

          <footer className="workbench-panel-footer">
            <div><strong>{workbench.entities.length}</strong> semantic components <span>·</span> <strong>{workbench.relations.length}</strong> relations</div>
            <p>Model revision {workbench.modelRevision}. Relationship types are checked against component kinds.</p>
          </footer>
        </>
      )}
    </section>
  );
}
