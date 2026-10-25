import { useMemo, useState } from "react";
import "./kubernetes-studio.css";
import { buildKubernetesArchitecturePlan } from "./kubernetesArchitecturePlanner.js";

const STARTER_ARCHITECTURES = [
  { id: "web-app", name: "Web application", description: "Ingress, Service, Deployment, Pods, ConfigMap, and Secret.", resources: ["k8s:ingress", "k8s:service", "k8s:deployment", "k8s:pod", "k8s:configmap", "k8s:secret"] },
  { id: "stateful-app", name: "Stateful application", description: "Namespace, Service, StatefulSet, Pod, and Node.", resources: ["k8s:namespace", "k8s:service", "k8s:statefulset", "k8s:pod", "k8s:node"] },
  { id: "cluster-basics", name: "Cluster basics", description: "Namespace, Nodes, API Server, Scheduler, and etcd.", resources: ["k8s:namespace", "k8s:node", "k8s:api-server", "k8s:scheduler", "k8s:etcd"] },
];

export default function KubernetesStudio({ icons = [], categories = [], onClose, onCreateDiagram, canEdit = true }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All resources");
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTab, setActiveTab] = useState("resources");
  const architecturePlan = useMemo(() => buildKubernetesArchitecturePlan(selectedIcons), [selectedIcons]);
  const [busy, setBusy] = useState(false);
  const filteredIcons = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return icons.filter((icon) => (category === "All resources" || icon.category === category) &&
      (!needle || [icon.name, icon.subtitle, icon.category, ...(icon.searchAliases || [])].join(" ").toLowerCase().includes(needle)));
  }, [icons, query, category]);
  const selectedIcons = useMemo(() => selectedIds.map((id) => icons.find((icon) => icon.id === id)).filter(Boolean), [icons, selectedIds]);
  const toggleResource = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const loadStarter = (starter) => {
    setSelectedIds(starter.resources.filter((id) => icons.some((icon) => icon.id === id)));
    setActiveTab("resources");
  };
  const create = async () => {
    if (!selectedIcons.length || !canEdit || busy) return;
    setBusy(true);
    try {
      await onCreateDiagram?.(selectedIcons);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="k8s-studio-overlay" role="dialog" aria-modal="true" aria-labelledby="k8s-studio-title">
      <section className="k8s-studio">
        <header className="k8s-studio-header">
          <div className="k8s-studio-mark" aria-hidden="true">☸</div>
          <div className="k8s-studio-heading">
            <span className="k8s-studio-eyebrow">SKETCHIZI · ARCHITECTURE WORKSPACE</span>
            <h1 id="k8s-studio-title">K8s Studio</h1>
            <p>Build a Kubernetes architecture from real resource definitions, then validate it in the main workspace.</p>
          </div>
          <button className="k8s-studio-close" type="button" onClick={onClose} aria-label="Close K8s Studio" title="Close">×</button>
        </header>
        <div className="k8s-studio-toolbar">
          <div className="k8s-studio-tabs" role="tablist" aria-label="K8s Studio sections">
            <button type="button" role="tab" aria-selected={activeTab === "resources"} className={activeTab === "resources" ? "active" : ""} onClick={() => setActiveTab("resources")}>Resource catalog</button>
            <button type="button" role="tab" aria-selected={activeTab === "starters"} className={activeTab === "starters" ? "active" : ""} onClick={() => setActiveTab("starters")}>Starter architectures</button>
            <button type="button" role="tab" aria-selected={activeTab === "review"} className={activeTab === "review" ? "active" : ""} onClick={() => setActiveTab("review")}>Architecture review</button>
          </div>
          <div className="k8s-studio-selection-count">{selectedIds.length} selected</div>
        </div>
        {activeTab === "resources" ? (
          <div className="k8s-studio-resource-view">
            <aside className="k8s-studio-categories" aria-label="Resource categories">
              <button type="button" className={category === "All resources" ? "active" : ""} onClick={() => setCategory("All resources")}>All resources <span>{icons.length}</span></button>
              {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}<span>{icons.filter((icon) => icon.category === item).length}</span></button>)}
            </aside>
            <main className="k8s-studio-catalog">
              <div className="k8s-studio-catalog-intro">
                <div><h2>Kubernetes resources</h2><p>Select resources to add to your diagram. Search supports common Kubernetes aliases.</p></div>
                <label className="k8s-studio-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources, e.g. ingress, CRD…" aria-label="Search Kubernetes resources" /></label>
              </div>
              <div className="k8s-studio-resource-grid">
                {filteredIcons.map((icon) => {
                  const selected = selectedIds.includes(icon.id);
                  return <button type="button" key={icon.id} className={selected ? "k8s-studio-resource selected" : "k8s-studio-resource"} onClick={() => toggleResource(icon.id)} aria-pressed={selected}>
                    <span className="k8s-studio-resource-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
                    <img src={icon.src} alt="" loading="lazy" />
                    <strong>{icon.name}</strong><small>{icon.category}</small><p>{icon.subtitle}</p>
                  </button>;
                })}
                {!filteredIcons.length && <div className="k8s-studio-empty">No resources match this search. Try a different name or category.</div>}
              </div>
            </main>
            <aside className="k8s-studio-selection">
              <h2>Diagram selection <span>{selectedIcons.length}</span></h2>
              {selectedIcons.length ? <ul>{selectedIcons.map((icon) => <li key={icon.id}><img src={icon.src} alt="" /><span>{icon.name}</span><button type="button" onClick={() => toggleResource(icon.id)} aria-label={`Remove ${icon.name}`}>×</button></li>)}</ul> : <p className="k8s-studio-selection-empty">Choose resources from the catalog, or start from a recommended architecture.</p>}
              <button type="button" className="k8s-studio-secondary" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>Clear selection</button>
            </aside>
          </div>
        ) : activeTab === "starters" ? (
          <div className="k8s-studio-starters">
            <div className="k8s-studio-catalog-intro"><div><h2>Start with a pattern</h2><p>Choose a useful baseline, then adjust the resource selection before adding it to your canvas.</p></div></div>
            <div className="k8s-studio-starter-grid">
              {STARTER_ARCHITECTURES.map((starter) => <article className="k8s-studio-starter" key={starter.id}>
                <div className="k8s-studio-starter-icon" aria-hidden="true">☸</div><h3>{starter.name}</h3><p>{starter.description}</p>
                <div className="k8s-studio-starter-resources">{starter.resources.map((id) => icons.find((icon) => icon.id === id)?.name).filter(Boolean).map((name) => <span key={name}>{name}</span>)}</div>
                <button type="button" className="k8s-studio-secondary" onClick={() => loadStarter(starter)}>Use this starter</button>
              </article>)}
            </div>
          </div>
        ) : (
          <div className="k8s-studio-review">
            <div className="k8s-studio-catalog-intro"><div><h2>Architecture review</h2><p>Review semantic connections that can be inferred before adding resources. Only supported intelligent resource types are included.</p></div></div>
            <div className="k8s-studio-review-summary">
              <div><strong>{architecturePlan.resources.length}</strong><span>selected resources</span></div>
              <div><strong>{architecturePlan.relationships.length}</strong><span>proposed relationships</span></div>
              <div><strong>{architecturePlan.diagnostics.filter((item) => item.severity === "warning").length}</strong><span>review warnings</span></div>
            </div>
            {architecturePlan.relationships.length ? <section className="k8s-studio-review-list"><h3>Proposed connections</h3><ul>{architecturePlan.relationships.map((relationship) => <li key={relationship.sourceIndex + "-" + relationship.targetIndex + "-" + relationship.relationshipType}><strong>{relationship.sourceName}</strong><span>{relationship.relationshipType}</span><strong>{relationship.targetName}</strong></li>)}</ul></section> : <p className="k8s-studio-selection-empty">Select supported resource types such as Namespace, Deployment, Service, Pod, or Node to preview relationships.</p>}
            {architecturePlan.diagnostics.length > 0 && <section className="k8s-studio-review-list"><h3>Notes</h3><ul>{architecturePlan.diagnostics.map((item, index) => <li className="k8s-studio-review-note" key={item.code + "-" + index}><span>{item.severity === "warning" ? "Review" : "Info"}</span><p>{item.message}</p></li>)}</ul></section>}
            <p className="k8s-studio-review-disclaimer">This is a pre-insertion plan, not a live validation result. Review the canvas after insertion.</p>
          </div>
        )}
        <footer className="k8s-studio-footer">
          <div><strong>{selectedIcons.length} resources ready</strong><span>Resources are added to your existing canvas; current diagram content is preserved.</span></div>
          <div className="k8s-studio-footer-actions"><button type="button" className="k8s-studio-secondary" onClick={onClose}>Cancel</button><button type="button" className="k8s-studio-primary" disabled={!selectedIcons.length || !canEdit || busy} onClick={create}>{busy ? "Adding resources…" : "Add to canvas →"}</button></div>
        </footer>
      </section>
    </div>
  );
}
