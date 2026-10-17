import { WORKBENCH_COMPONENTS, WORKBENCH_VIEWS } from "./workbenchRegistry.js";

export default function WorkbenchPanel({
  workbench,
  isOpen,
  onClose,
  onInitialize,
  onSwitchView,
  onAddComponent,
  busy = false,
  canEdit = true,
}) {
  if (!isOpen) return null;
  const activeViewId = workbench?.activeViewId || "system";
  const currentView = (workbench?.views || WORKBENCH_VIEWS).find((view) => view.id === activeViewId);
  const grouped = WORKBENCH_COMPONENTS.reduce((groups, component) => {
    (groups[component.group] ||= []).push(component);
    return groups;
  }, {});

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
        <div className="workbench-welcome">
          <div className="workbench-eyebrow">DESIGN · VALIDATE · GENERATE</div>
          <h2>Bring the system model into your drawing.</h2>
          <p>Enable Workbench for this document to add typed engineering components and keep multiple views linked through one shared model.</p>
          <button type="button" className="workbench-primary" disabled={!canEdit || busy} onClick={onInitialize}>Enable Workbench</button>
          <p className="workbench-note">Your existing shapes and icons remain visual-only. Enabling Workbench does not convert them.</p>
        </div>
      ) : (
        <>
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

          <footer className="workbench-panel-footer">
            <div><strong>{workbench.entities.length}</strong> semantic components <span>·</span> <strong>{workbench.relations.length}</strong> relations</div>
            <p>Model revision {workbench.modelRevision}. Typed relations, validation findings, and artifact generation arrive in the next slices.</p>
          </footer>
        </>
      )}
    </section>
  );
}
