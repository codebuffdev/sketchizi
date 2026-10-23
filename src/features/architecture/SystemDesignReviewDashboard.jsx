import { useMemo, useState } from "react";
import { analyzeSystemDesignQuality } from "./systemDesignIntelligence.js";
import { getSystemDesignRecommendation, previewSystemDesignRecommendation } from "./systemDesignRecommendations.js";
import "../../styles/system-design-review.css";

function toGraph(elements = []) {
  const nodes = elements.filter((e) => e && !e.isDeleted && ["rectangle", "diamond", "ellipse", "image", "text", "embeddable", "frame"].includes(e.type)).map((e) => {
    const meta = e.customData?.systemDesign || e.customData?.architecture || {};
    return { id: e.id, name: e.text || meta.name || e.originalName || e.type, type: meta.type || e.type, role: meta.role, replicas: meta.replicas, availabilityZones: meta.availabilityZones, trafficPattern: meta.trafficPattern || meta.workload, cachePresent: meta.cachePresent };
  });
  const edges = elements.filter((e) => e && !e.isDeleted && ["arrow", "line"].includes(e.type)).map((e) => ({ sourceId: e.startBinding?.elementId || e.customData?.systemDesign?.sourceId, targetId: e.endBinding?.elementId || e.customData?.systemDesign?.targetId, type: e.customData?.systemDesign?.relationshipType || e.type })).filter((e) => e.sourceId && e.targetId);
  return { nodes, edges };
}

export default function SystemDesignReviewDashboard({ elements = [], onSelectComponent, onApplyRecommendation, onClose }) {
  const [filter, setFilter] = useState("all");
  const [previewId, setPreviewId] = useState(null);
  const graph = useMemo(() => toGraph(elements), [elements]);
  const review = useMemo(() => analyzeSystemDesignQuality(graph), [graph]);
  const visible = review.diagnostics.filter((item) => filter === "all" || item.severity === filter);
  const previewItem = previewId ? review.diagnostics.find((item) => item.diagnosticId === previewId) : null;
  const preview = previewItem ? previewSystemDesignRecommendation(previewItem, elements) : null;
  return <section className="system-design-review" aria-label="System design review dashboard">
    <header className="system-design-review__header"><div><h2>System design review</h2><p>Review structural findings and preview supported changes. Nothing is changed until you approve an applicable recommendation.</p></div>{onClose && <button type="button" onClick={onClose} aria-label="Close system design review">×</button>}</header>
    <div className="system-design-review__summary"><div><span>Components</span><strong>{review.summary.components}</strong></div><div><span>Connections</span><strong>{review.summary.connections}</strong></div><div data-severity="error"><span>Errors</span><strong>{review.summary.errors}</strong></div><div data-severity="warning"><span>Warnings</span><strong>{review.summary.warnings}</strong></div><div><span>Info</span><strong>{review.summary.info}</strong></div></div>
    <label className="system-design-review__filter">Severity <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All findings</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Information</option></select></label>
    {visible.length ? <ul className="system-design-review__findings">{visible.map((item) => { const recommendation = getSystemDesignRecommendation(item); return <li key={item.diagnosticId} data-severity={item.severity}><div><span className="system-design-review__badge">{item.severity}</span><strong>{item.title}</strong><p>{item.message}</p><small>{item.code}</small></div><div className="system-design-review__actions">{item.nodeIds.length > 0 && onSelectComponent && <button type="button" onClick={() => onSelectComponent(item.nodeIds[0])}>Select component</button>}{recommendation && <button type="button" onClick={() => setPreviewId(item.diagnosticId)}>Preview improvement</button>}</div></li>; })}</ul> : <p className="system-design-review__empty">{review.diagnostics.length ? "No findings match this severity filter." : "No structural issues were detected by these checks. This is not a guarantee of production readiness."}</p>}
    {preview && <div className="system-design-review__preview" role="dialog" aria-modal="true" aria-label="Recommendation preview"><h3>{preview.recommendation.title}</h3><p>{preview.recommendation.rationale}</p>{preview.applicable ? <><dl><dt>Component</dt><dd>{preview.targetName}</dd><dt>Current {preview.recommendation.property}</dt><dd>{preview.currentValue ?? "Not specified (treated as 1 for preview)"}</dd><dt>Proposed {preview.recommendation.property}</dt><dd>{preview.proposedValue}</dd></dl><p className="system-design-review__caution">This edits only the component metadata. It does not provision infrastructure or guarantee availability.</p>{onApplyRecommendation && <button type="button" onClick={() => { onApplyRecommendation(previewItem, preview); setPreviewId(null); }}>Approve and apply</button>}</> : <p>{preview.reason}</p>}<button type="button" onClick={() => setPreviewId(null)}>Cancel</button></div>}
  </section>;
}
