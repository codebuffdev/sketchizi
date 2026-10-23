import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildKubernetesDeploymentReviewExport,
  renderKubernetesDeploymentReviewMarkdown,
} from "../../features/architecture/kubernetesDeploymentReviewExport.js";
import {
  loadKubernetesReviewHistory,
  saveKubernetesReviewSnapshot,
  deleteKubernetesReviewSnapshot,
  summarizeKubernetesReviewHistory,
} from "../../features/architecture/kubernetesDeploymentReviewHistory.js";
import {
  compareKubernetesDeploymentReviews,
} from "../../features/architecture/kubernetesDeploymentReviewComparison.js";
import {
  buildKubernetesDeploymentReviewComparisonExport,
  renderKubernetesDeploymentReviewComparisonMarkdown,
} from "../../features/architecture/kubernetesDeploymentReviewComparisonExport.js";
import {
  loadKubernetesRemediationChecklist,
  syncKubernetesRemediationChecklist,
  setKubernetesRemediationTaskStatus,
  summarizeKubernetesRemediationChecklist,
  buildKubernetesRemediationChecklistExport,
  renderKubernetesRemediationChecklistMarkdown,
} from "../../features/architecture/kubernetesRemediationChecklist.js";
import {
  buildKubernetesExecutiveReviewReport,
  renderKubernetesExecutiveReviewMarkdown,
} from "../../features/architecture/kubernetesExecutiveReviewReport.js";
import "../../styles/architecture-validation.css";
import SystemDesignReviewDashboard from "../../features/architecture/SystemDesignReviewDashboard.jsx";
import { compareSystemDesignArchitectures } from "../../features/architecture/systemDesignComparison.js";
import { diffSystemDesignGraphs } from "../../features/architecture/systemDesignVisualDiff.js";
import { loadDecisionRecords, saveDecisionRecords, normalizeDecisionRecord, buildDecisionRecordExport } from "../../features/architecture/systemDesignDecisionRecords.js";
import { buildSystemDesignReviewReport, renderSystemDesignReviewReportMarkdown } from "../../features/architecture/systemDesignReviewReport.js";
import { createReviewSession, updateReviewSession, finalizeReviewSession, loadReviewSession, saveReviewSession, renderReviewSessionMarkdown } from "../../features/architecture/systemDesignReviewWorkflow.js";

const storage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};
const diagnosticId = (item) => String(item?.diagnosticId || [item?.code || "", item?.resourceId || "", item?.relationshipId || ""].join("|"));
const diagnosticFingerprint = (item) => JSON.stringify([item?.code || "", item?.severity || "", item?.message || "", item?.remediation || "", item?.resourceId || "", item?.relationshipId || "", item?.relationshipType || "", item?.sourceResourceId || "", item?.targetResourceId || ""]);
const safeName = (value) => String(value || "review").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "review";
function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}
function DiagnosticGroup({ title, diagnostics, onSelectDiagnostic, onApplyKubernetesSuggestion, canApplyCorrections, reviewedFindings, onToggleReviewed }) {
  if (!diagnostics.length) return null;
  return (
    <section className={`architecture-validation-section severity-${title.toLowerCase()}`}>
      <div className="architecture-validation-section-title"><span>{title}</span><span className="architecture-validation-count">{diagnostics.length}</span></div>
      <div className="architecture-validation-list">
        {diagnostics.map((diagnostic) => {
          const selectable = Boolean(diagnostic.relationshipId || diagnostic.resourceId);
          const id = diagnosticId(diagnostic);
          const isReviewed = reviewedFindings.get(id)?.fingerprint === diagnosticFingerprint(diagnostic);
          const content = <>
            <div className="architecture-validation-diagnostic-message">{diagnostic.message}</div>
            {diagnostic.code === "KUBERNETES_INVALID_RELATIONSHIP" && <div className="architecture-validation-diagnostic-details"><span>{diagnostic.sourceResourceType || diagnostic.sourceResourceId || "Unknown source"}</span><span aria-hidden="true">→</span><span>{diagnostic.targetResourceType || diagnostic.targetResourceId || "Unknown target"}</span>{diagnostic.relationshipType && <span>Type: {diagnostic.relationshipType}</span>}</div>}
            {diagnostic.code === "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE" && diagnostic.relationshipType && <div className="architecture-validation-diagnostic-details">Type: {diagnostic.relationshipType}</div>}
            {diagnostic.remediation && <div className="architecture-validation-diagnostic-remediation">{diagnostic.remediation}</div>}
            {Array.isArray(diagnostic.suggestedRelationshipTypes) && diagnostic.suggestedRelationshipTypes.length > 0 && <div className="architecture-validation-diagnostic-details">Suggested types: {diagnostic.suggestedRelationshipTypes.join(", ")}</div>}
            <div className="architecture-validation-diagnostic-meta">{diagnostic.provider && <span className="architecture-validation-provider">{diagnostic.provider}</span>}<span className="architecture-validation-diagnostic-code">{diagnostic.code}</span></div>
          </>;
          const canSuggest = diagnostic.provider === "kubernetes" && ["KUBERNETES_INVALID_RELATIONSHIP", "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE"].includes(diagnostic.code) && Array.isArray(diagnostic.suggestedRelationshipTypes) && diagnostic.suggestedRelationshipTypes.length > 0;
          return <article className="architecture-validation-diagnostic-card" key={id}>
            {selectable ? <button type="button" className="architecture-validation-diagnostic architecture-validation-diagnostic-action" onClick={() => onSelectDiagnostic?.(diagnostic)} title="Select affected canvas element">{content}</button> : <div className="architecture-validation-diagnostic">{content}</div>}
            <div className="architecture-review-inline-actions">
              <button type="button" className="architecture-review-toggle" aria-pressed={isReviewed} onClick={() => onToggleReviewed(diagnostic)}>{isReviewed ? "Mark not reviewed" : "Mark reviewed"}</button>
              {canSuggest && (canApplyCorrections ? <div className="architecture-validation-fix-actions" aria-label="Suggested relationship corrections"><div className="architecture-validation-fix-note">You’ll be asked to confirm before applying a correction.</div>{diagnostic.suggestedRelationshipTypes.map((relationshipType) => <button key={relationshipType} type="button" className="architecture-validation-fix-button" onClick={() => onApplyKubernetesSuggestion?.(diagnostic, relationshipType)}>Use “{relationshipType}”</button>)}</div> : <div className="architecture-validation-fix-note">Switch to an editable session to apply a correction.</div>)}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

export default function ArchitectureValidationPanel({ validation, sceneElements = [], onClose, onSelectDiagnostic, onApplyKubernetesSuggestion, canApplyCorrections = false }) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const info = validation?.info || [];
  const hasDiagnostics = errors.length > 0 || warnings.length > 0 || info.length > 0;
  const diagnostics = useMemo(() => [...errors, ...warnings, ...info], [errors, warnings, info]);
  const kubernetesDiagnostics = useMemo(() => diagnostics.filter((item) => item?.provider === "kubernetes" || String(item?.code || "").startsWith("KUBERNETES_")), [diagnostics]);
  const [findingFilter, setFindingFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [findingQuery, setFindingQuery] = useState("");
  const [reviewedFindings, setReviewedFindings] = useState(() => new Map());
  const [resolvedFindings, setResolvedFindings] = useState([]);
  const previousDiagnosticsRef = useRef(new Map());
  const [reviewHistory, setReviewHistory] = useState(() => loadKubernetesReviewHistory(storage()));
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [comparisonFilter, setComparisonFilter] = useState("all");
  const [comparisonResourceQuery, setComparisonResourceQuery] = useState("");
  const [comparisonSort, setComparisonSort] = useState("severity");
  const [comparisonReportPair, setComparisonReportPair] = useState(null);
  const [remediationTasks, setRemediationTasks] = useState(() => loadKubernetesRemediationChecklist(storage()).tasks);
  const [remediationFilter, setRemediationFilter] = useState("all");
  const [remediationQuery, setRemediationQuery] = useState("");
  const [remediationMessage, setRemediationMessage] = useState("");
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [comparisonDesignName, setComparisonDesignName] = useState("Alternative design");
  const [comparisonDesignJson, setComparisonDesignJson] = useState("{\n  \"nodes\": [],\n  \"edges\": []\n}");
  const [systemComparison, setSystemComparison] = useState(null);
  const [systemComparisonError, setSystemComparisonError] = useState("");
  const [decisionRecords, setDecisionRecords] = useState(() => loadDecisionRecords(storage()));
  const [adrDraft, setAdrDraft] = useState({ title: "", status: "proposed", context: "", decision: "", consequences: "", alternatives: "", linkedComponentIds: "" });
  const [adrMessage, setAdrMessage] = useState("");
  const [workflowSession, setWorkflowSession] = useState(() => loadReviewSession(storage()));
  const [workflowMessage, setWorkflowMessage] = useState("");
  const prefersReducedMotion = useMemo(() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }, []);

  useEffect(() => {
    const currentMap = new Map(diagnostics.map((item) => [diagnosticId(item), { fingerprint: diagnosticFingerprint(item), diagnostic: item }]));
    const previous = previousDiagnosticsRef.current;
    const newlyResolved = [];
    for (const [key, previousEntry] of previous) {
      const current = currentMap.get(key);
      if (!current) newlyResolved.push({ id: key, diagnostic: previousEntry.diagnostic, resolvedReason: "cleared", message: "finding no longer present" });
      else if (current.fingerprint !== previousEntry.fingerprint) {
        setReviewedFindings((old) => { const next = new Map(old); next.delete(key); return next; });
        newlyResolved.push({ id: key, diagnostic: previousEntry.diagnostic, resolvedReason: "changed", message: "finding changed after revalidation" });
      }
    }
    if (newlyResolved.length) setResolvedFindings((old) => [...newlyResolved, ...old].slice(0, 200));
    previousDiagnosticsRef.current = currentMap;
  }, [diagnostics]);

  const toggleReviewed = useCallback((item) => setReviewedFindings((old) => {
    const next = new Map(old); const id = diagnosticId(item);
    if (next.get(id)?.fingerprint === diagnosticFingerprint(item)) next.delete(id);
    else next.set(id, { fingerprint: diagnosticFingerprint(item), reviewedAt: new Date().toISOString() });
    return next;
  }), []);
  const reviewReport = useMemo(() => buildKubernetesDeploymentReviewExport({ validation, resolvedFindings, reviewedFindings }), [validation, resolvedFindings, reviewedFindings]);
  const reviewProgressPercent = reviewReport.summary.total ? Math.round((reviewReport.summary.reviewed / reviewReport.summary.total) * 100) : 100;
  const historySummaries = useMemo(() => summarizeKubernetesReviewHistory(reviewHistory), [reviewHistory]);
  const selectedSnapshot = reviewHistory.find((entry) => entry.id === selectedSnapshotId)?.snapshot || null;
  const comparison = useMemo(() => selectedSnapshot ? compareKubernetesDeploymentReviews(selectedSnapshot, reviewReport) : null, [selectedSnapshot, reviewReport]);
  const comparisonExport = useMemo(() => comparison ? buildKubernetesDeploymentReviewComparisonExport({ comparison, baseline: selectedSnapshot, current: reviewReport }) : null, [comparison, selectedSnapshot, reviewReport]);
  const remediationSummary = useMemo(() => summarizeKubernetesRemediationChecklist(remediationTasks), [remediationTasks]);
  const visibleDiagnostics = diagnostics.filter((item) => {
    const id = diagnosticId(item); const reviewed = reviewedFindings.get(id)?.fingerprint === diagnosticFingerprint(item);
    if (findingFilter === "reviewed" && !reviewed) return false;
    if (findingFilter === "unreviewed" && reviewed) return false;
    if (resourceFilter !== "all" && item.resourceId !== resourceFilter && item.sourceResourceId !== resourceFilter && item.targetResourceId !== resourceFilter) return false;
    const query = findingQuery.trim().toLowerCase();
    return !query || [item.code, item.message, item.remediation, item.resourceId, item.sourceResourceId, item.targetResourceId].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const filteredErrors = visibleDiagnostics.filter((item) => errors.includes(item));
  const filteredWarnings = visibleDiagnostics.filter((item) => warnings.includes(item));
  const filteredInfo = visibleDiagnostics.filter((item) => info.includes(item));
  const visibleTasks = remediationTasks.filter((task) => {
    if (remediationFilter === "pending" && task.status !== "pending") return false;
    if (remediationFilter === "completed" && task.status !== "completed") return false;
    if (remediationFilter === "resolved" && task.findingPresent !== false) return false;
    if (remediationFilter === "active" && task.findingPresent === false) return false;
    if (remediationFilter === "pending-errors" && !(task.status === "pending" && task.severity === "error")) return false;
    const query = remediationQuery.trim().toLowerCase();
    return !query || [task.code, task.message, task.resourceId, task.remediation].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const comparisonGroups = comparison ? [{ key: "added", title: "Added", entries: comparison.added }, { key: "changed", title: "Changed", entries: comparison.changed }, { key: "resolved", title: "Resolved", entries: comparison.resolved }, { key: "unchanged", title: "Unchanged", entries: comparison.unchanged }] : [];
  const comparisonVisibleGroups = comparisonGroups.map((group) => ({ ...group, entries: group.entries.filter((entry) => {
    if (comparisonFilter === "changed-only" && group.key !== "added" && group.key !== "changed") return false;
    if (comparisonFilter === "severity-increased" && !(entry.changes?.severity && (entry.finding?.severity === "error" || entry.finding?.severity === "warning"))) return false;
    if (comparisonFilter === "remediation-changed" && !entry.changes?.remediation) return false;
    if (comparisonFilter === "unresolved-errors" && !(group.key !== "resolved" && entry.finding?.severity === "error")) return false;
    const query = comparisonResourceQuery.trim().toLowerCase();
    return !query || [entry.finding?.resourceId, entry.finding?.message, entry.finding?.code, entry.previous?.resourceId].some((value) => String(value || "").toLowerCase().includes(query));
  }).sort((a, b) => comparisonSort === "name" ? String(a.finding?.resourceId || a.previous?.resourceId || "").localeCompare(String(b.finding?.resourceId || b.previous?.resourceId || "")) : ({ error: 0, warning: 1, info: 2 }[a.finding?.severity] ?? 3) - ({ error: 0, warning: 1, info: 2 }[b.finding?.severity] ?? 3)) }));
  const comparisonVisibleCount = comparisonVisibleGroups.reduce((count, group) => count + group.entries.length, 0);
  const allDiagnostics = diagnostics;
  const hasActiveReviewViewFilters = Boolean(findingFilter !== "all" || resourceFilter !== "all" || findingQuery || comparisonFilter !== "all" || comparisonResourceQuery || comparisonSort !== "severity" || remediationFilter !== "all" || remediationQuery);

  const navigateToReviewSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  };
  const resetFindingFilters = () => {
    setFindingFilter("all");
    setResourceFilter("all");
    setFindingQuery("");
  };
  const resetComparisonFilters = () => {
    setComparisonFilter("all");
    setComparisonResourceQuery("");
    setComparisonSort("severity");
  };
  const resetRemediationFilters = () => {
    setRemediationFilter("all");
    setRemediationQuery("");
  };
  const clearFindingFilters = resetFindingFilters;
  const clearComparisonFilters = resetComparisonFilters;
  const clearRemediationFilters = resetRemediationFilters;

  const refreshRemediationTasks = () => {
    const result = syncKubernetesRemediationChecklist(storage(), kubernetesDiagnostics);
    setRemediationTasks(result.tasks); setRemediationMessage(result.ok ? "Remediation tasks refreshed from current findings." : "Could not persist remediation tasks in this browser.");
  };
  const toggleRemediationTask = (task) => {
    const result = setKubernetesRemediationTaskStatus(storage(), remediationTasks, task.id, task.status === "completed" ? "pending" : "completed");
    setRemediationTasks(result.tasks); setRemediationMessage(result.ok ? "Remediation status updated." : "Could not save remediation status.");
  };
  const resetReviewView = () => {
    setFindingFilter("all");
    setResourceFilter("all");
    setComparisonFilter("all");
    setComparisonResourceQuery("");
    setComparisonSort("severity");
    setRemediationFilter("all");
    setRemediationQuery("");
    setFindingQuery("");
    setDashboardMessage("All review filters have been reset. Review data was preserved.");
  };

  const saveSnapshot = () => {
    const result = saveKubernetesReviewSnapshot(storage(), reviewReport);
    setReviewHistory(result.history); if (result.history[0]) setSelectedSnapshotId(result.history[0].id);
    setDashboardMessage(result.ok ? "Review snapshot saved." : "Snapshot could not be saved. Check browser storage availability.");
  };
  const removeSnapshot = () => {
    if (!selectedSnapshotId) return;
    const result = deleteKubernetesReviewSnapshot(storage(), selectedSnapshotId);
    setReviewHistory(result.history); setSelectedSnapshotId(""); setDashboardMessage(result.ok ? "Selected snapshot deleted." : "Snapshot could not be deleted.");
  };
  const downloadComparisonReport = (format) => {
    if (!comparisonExport) return;
    downloadText(`sketchizi-review-comparison.${format === "json" ? "json" : "md"}`, format === "json" ? JSON.stringify(comparisonExport, null, 2) : renderKubernetesDeploymentReviewComparisonMarkdown(comparisonExport), format === "json" ? "application/json" : "text/markdown");
  };
  const downloadExecutiveReviewReport = (format) => {
    const report = buildKubernetesExecutiveReviewReport({ reviewReport, readiness: { progressPercent: reviewProgressPercent }, comparison, remediationTasks });
    downloadText(`sketchizi-executive-review.${format === "json" ? "json" : "md"}`, format === "json" ? JSON.stringify(report, null, 2) : renderKubernetesExecutiveReviewMarkdown(report), format === "json" ? "application/json" : "text/markdown");
  };
  const exportChecklist = (format) => {
    const report = buildKubernetesRemediationChecklistExport(remediationTasks);
    downloadText(`sketchizi-remediation-checklist.${format === "json" ? "json" : "md"}`, format === "json" ? JSON.stringify(report, null, 2) : renderKubernetesRemediationChecklistMarkdown(report), format === "json" ? "application/json" : "text/markdown");
  };
  const resetFiltersAvailable = hasActiveReviewViewFilters;
  const hasFilteredFindings = (findingFilter !== "all" || resourceFilter !== "all") && visibleDiagnostics.length === 0;
  const currentSystemDesignGraph = useMemo(() => {
    const nodes = sceneElements.filter((item) => item && !item.isDeleted && !["arrow", "line"].includes(item.type)).map((item) => ({ id: item.id, name: item.text || item.customData?.systemDesign?.name || item.type, type: item.customData?.systemDesign?.type || item.type, role: item.customData?.systemDesign?.role || item.customData?.architecture?.role, replicas: item.customData?.systemDesign?.replicas, availabilityZones: item.customData?.systemDesign?.availabilityZones }));
    const edges = sceneElements.filter((item) => item && !item.isDeleted && ["arrow", "line"].includes(item.type)).map((item) => ({ id: item.id, sourceId: item.startBinding?.elementId || item.customData?.systemDesign?.sourceId, targetId: item.endBinding?.elementId || item.customData?.systemDesign?.targetId, type: item.customData?.systemDesign?.relationshipType || item.type })).filter((item) => item.sourceId && item.targetId);
    return { nodes, edges };
  }, [sceneElements]);
  const loadSavedDesignForComparison = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const scene = raw?.type === "sketchizi" ? raw.diagram : raw;
      const elements = Array.isArray(scene?.elements) ? scene.elements : Array.isArray(raw?.elements) ? raw.elements : null;
      let graph;
      if (elements) {
        const active = elements.filter((item) => item && !item.isDeleted);
        const nodes = active.filter((item) => !["arrow", "line"].includes(item.type)).map((item) => ({ id: String(item.id), name: item.text || item.customData?.systemDesign?.name || item.customData?.architecture?.name || item.type, type: item.customData?.systemDesign?.type || item.customData?.architecture?.type || item.type, role: item.customData?.systemDesign?.role || item.customData?.architecture?.role, replicas: item.customData?.systemDesign?.replicas, availabilityZones: item.customData?.systemDesign?.availabilityZones }));
        const edges = active.filter((item) => ["arrow", "line"].includes(item.type)).map((item) => ({ id: String(item.id), sourceId: item.startBinding?.elementId || item.customData?.systemDesign?.sourceId, targetId: item.endBinding?.elementId || item.customData?.systemDesign?.targetId, type: item.customData?.systemDesign?.relationshipType || item.type })).filter((item) => item.sourceId && item.targetId);
        graph = { nodes, edges };
      } else if (Array.isArray(raw?.nodes) && Array.isArray(raw?.edges)) graph = raw;
      else throw new Error("Choose a valid .sketchizi, .excalidraw, or graph JSON file.");
      setComparisonDesignName(String(raw?.metadata?.title || file.name.replace(/\.(sketchizi|excalidraw|json)$/i, "")).slice(0, 80));
      setComparisonDesignJson(JSON.stringify(graph, null, 2));
      setSystemComparison(null); setSystemComparisonError("");
    } catch (error) { setSystemComparisonError(error instanceof Error ? error.message : "Could not read this design file."); }
    event.target.value = "";
  };
  const runSystemDesignComparison = () => {
    try {
      const parsed = JSON.parse(comparisonDesignJson);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new Error("Provide a JSON object with nodes and edges arrays.");
      setSystemComparison({ ...compareSystemDesignArchitectures(currentSystemDesignGraph, parsed), visualDiff: diffSystemDesignGraphs(currentSystemDesignGraph, parsed) });
      setSystemComparisonError("");
    } catch (error) { setSystemComparison(null); setSystemComparisonError(error instanceof Error ? error.message : "Could not compare designs."); }
  };
  const persistWorkflowSession = (next) => {
    try { const saved = saveReviewSession(next, storage()); setWorkflowSession(saved); setWorkflowMessage(`Review ${saved.status.replace("_", " ")} and saved locally.`); }
    catch (error) { setWorkflowMessage(error instanceof Error ? error.message : "Could not save review session."); }
  };
  const startWorkflowReview = () => persistWorkflowSession(createReviewSession({ title: "Sketchizi Architecture Review", graph: currentSystemDesignGraph, diagnostics: allDiagnostics, decisions: decisionRecords, remediation: remediationTasks }));
  const refreshWorkflowSnapshot = () => {
    if (!workflowSession) return;
    try { persistWorkflowSession(updateReviewSession(workflowSession, { snapshot: { nodes: currentSystemDesignGraph.nodes, edges: currentSystemDesignGraph.edges }, findings: allDiagnostics.map((item, index) => ({ id: String(item?.diagnosticId || item?.code || `finding-${index}`), severity: item?.severity || "info", code: item?.code || "UNKNOWN", message: item?.message || item?.title || "Finding", status: "open", note: "" })), decisions: decisionRecords.map((item) => ({ id: String(item.id), title: item.title, status: item.status })), remediation: remediationTasks.map((item) => ({ id: String(item.id), title: item.message || item.title || "Remediation task", status: item.status === "completed" ? "completed" : "pending" }) })); }
    catch (error) { setWorkflowMessage(error instanceof Error ? error.message : "Could not refresh review."); }
  };

  return <section className="architecture-validation-panel" aria-label="Architecture Validation">
    <header className="architecture-validation-header"><div><div className="architecture-validation-title">Architecture Validation</div><div className="architecture-validation-subtitle">Current canvas diagnostics</div></div><button type="button" className="architecture-validation-close" onClick={onClose} aria-label="Close architecture validation">×</button></header>
    <SystemDesignReviewDashboard elements={sceneElements} onSelectComponent={(elementId) => onSelectDiagnostic?.({ elementId, resourceId: elementId, code: "SYSTEM_DESIGN_REVIEW" })} />
    <section className="architecture-review-section system-design-comparison-ui" aria-label="Compare system designs">
      <h2>Compare system designs</h2>
      <p>Compare the current canvas with another design supplied as a graph JSON document. The comparison is heuristic and does not measure runtime performance or cost.</p>
      <label>Alternative design name <input value={comparisonDesignName} onChange={(event) => setComparisonDesignName(event.target.value)} maxLength={80} /></label>
      <label>Load saved design (.sketchizi / .excalidraw / graph JSON) <input type="file" accept=".sketchizi,.excalidraw,.json,application/json" onChange={loadSavedDesignForComparison} /></label>
      <label>Alternative design graph JSON <textarea value={comparisonDesignJson} onChange={(event) => setComparisonDesignJson(event.target.value)} rows={7} spellCheck={false} /></label>
      <button type="button" onClick={runSystemDesignComparison}>Compare with current canvas</button>
      {systemComparisonError && <p role="alert" className="architecture-review-filter-status">{systemComparisonError}</p>}
      {systemComparison && <div className="system-design-comparison-results" aria-live="polite">
        <div className="architecture-review-dashboard-grid"><article className="architecture-review-dashboard-card"><h3>Current canvas</h3><strong>{systemComparison.left.score}/100</strong><p>{systemComparison.left.grade}</p></article><article className="architecture-review-dashboard-card"><h3>{comparisonDesignName || "Alternative design"}</h3><strong>{systemComparison.right.score}/100</strong><p>{systemComparison.right.grade}</p></article><article className="architecture-review-dashboard-card"><h3>Score difference</h3><strong>{systemComparison.scoreDelta > 0 ? "+" : ""}{systemComparison.scoreDelta}</strong><p>{systemComparison.winner === "tie" ? "Scores are tied" : systemComparison.winner === "right" ? "Alternative scores higher" : "Current canvas scores higher"}</p></article></div>
        <table><thead><tr><th>Metric</th><th>Current</th><th>Alternative</th><th>Difference</th></tr></thead><tbody>{systemComparison.metrics.map((metric) => <tr key={metric.label}><th>{metric.label}</th><td>{metric.left}</td><td>{metric.right}</td><td>{metric.delta > 0 ? "+" : ""}{metric.delta}</td></tr>)}</tbody></table>
        <section className="system-design-visual-diff" aria-label="Visual architecture differences"><h3>What changed</h3><div className="architecture-review-dashboard-grid">{[{ key: "addedComponents", label: "Components added" }, { key: "removedComponents", label: "Components removed" }, { key: "changedComponents", label: "Components changed" }, { key: "addedConnections", label: "Connections added" }, { key: "removedConnections", label: "Connections removed" }].map((item) => <article className="architecture-review-dashboard-card" key={item.key}><h4>{item.label}</h4><strong>{systemComparison.visualDiff.counts[item.key]}</strong></article>)}</div>{systemComparison.visualDiff.counts.addedComponents > 0 && <div><h4>Added components</h4><ul>{systemComparison.visualDiff.addedComponents.map((item) => <li key={item.id}>{item.name} <small>({item.id})</small></li>)}</ul></div>}{systemComparison.visualDiff.counts.removedComponents > 0 && <div><h4>Removed components</h4><ul>{systemComparison.visualDiff.removedComponents.map((item) => <li key={item.id}>{item.name} <small>({item.id})</small></li>)}</ul></div>}{systemComparison.visualDiff.counts.changedComponents > 0 && <div><h4>Changed components</h4><ul>{systemComparison.visualDiff.changedComponents.map((item) => <li key={item.id}>{item.name}: {item.fields.join(", ")}</li>)}</ul></div>}{(systemComparison.visualDiff.counts.addedConnections > 0 || systemComparison.visualDiff.counts.removedConnections > 0) && <div><h4>Connection changes</h4><ul>{systemComparison.visualDiff.addedConnections.map((item, index) => <li key={`added-${index}`}>Added: {item.sourceId} → {item.targetId} ({item.type})</li>)}{systemComparison.visualDiff.removedConnections.map((item, index) => <li key={`removed-${index}`}>Removed: {item.sourceId} → {item.targetId} ({item.type})</li>)}</ul></div>}<p>{systemComparison.visualDiff.note}</p></section><p>{systemComparison.caveat}</p><button type="button" onClick={() => downloadText("sketchizi-system-design-comparison.json", JSON.stringify({ alternativeName: comparisonDesignName, ...systemComparison }, null, 2), "application/json")}>Export comparison report (JSON)</button>
      </div>}
    </section>
    <section className="architecture-review-section system-design-adr" aria-label="Architecture decision records">
      <h2>Architecture decision records</h2>
      <p>Record why a design choice was made, what alternatives were considered, and the expected consequences. Records are stored in this browser only.</p>
      <form onSubmit={(event) => { event.preventDefault(); try { const record = normalizeDecisionRecord({ ...adrDraft, linkedComponentIds: adrDraft.linkedComponentIds.split(",").map((id) => id.trim()).filter(Boolean) }); const next = [record, ...decisionRecords.filter((item) => item.id !== record.id)].slice(0, 100); if (!saveDecisionRecords(storage(), next)) throw new Error("Could not save records in browser storage."); setDecisionRecords(next); setAdrDraft({ title: "", status: "proposed", context: "", decision: "", consequences: "", alternatives: "", linkedComponentIds: "" }); setAdrMessage("Decision record saved."); } catch (error) { setAdrMessage(error instanceof Error ? error.message : "Could not save decision record."); } }}>
        <label>Decision title <input required maxLength={160} value={adrDraft.title} onChange={(event) => setAdrDraft({ ...adrDraft, title: event.target.value })} placeholder="e.g. Use a queue for media processing" /></label>
        <label>Status <select value={adrDraft.status} onChange={(event) => setAdrDraft({ ...adrDraft, status: event.target.value })}><option value="proposed">Proposed</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="superseded">Superseded</option></select></label>
        <label>Context and problem <textarea rows={3} maxLength={4000} value={adrDraft.context} onChange={(event) => setAdrDraft({ ...adrDraft, context: event.target.value })} /></label>
        <label>Decision <textarea rows={3} maxLength={4000} value={adrDraft.decision} onChange={(event) => setAdrDraft({ ...adrDraft, decision: event.target.value })} /></label>
        <label>Consequences and trade-offs <textarea rows={3} maxLength={4000} value={adrDraft.consequences} onChange={(event) => setAdrDraft({ ...adrDraft, consequences: event.target.value })} /></label>
        <label>Alternatives considered <textarea rows={2} maxLength={4000} value={adrDraft.alternatives} onChange={(event) => setAdrDraft({ ...adrDraft, alternatives: event.target.value })} /></label>
        <label>Related component IDs (comma-separated) <input value={adrDraft.linkedComponentIds} onChange={(event) => setAdrDraft({ ...adrDraft, linkedComponentIds: event.target.value })} placeholder="api-service, queue" /></label>
        <button type="submit">Save decision record</button> <button type="button" onClick={() => downloadText("sketchizi-architecture-decisions.json", JSON.stringify(buildDecisionRecordExport(decisionRecords), null, 2), "application/json")}>Export ADRs (JSON)</button>
      </form>
      {adrMessage && <p role="status" aria-live="polite">{adrMessage}</p>}
      <div className="system-design-adr__list">{decisionRecords.length ? decisionRecords.map((record) => <article key={record.id} className="architecture-review-dashboard-card"><div className="system-design-adr__title"><h3>{record.title}</h3><span>{record.status}</span></div>{record.context && <p><strong>Context:</strong> {record.context}</p>}{record.decision && <p><strong>Decision:</strong> {record.decision}</p>}{record.consequences && <p><strong>Consequences:</strong> {record.consequences}</p>}{record.alternatives && <p><strong>Alternatives:</strong> {record.alternatives}</p>}{record.linkedComponentIds.length > 0 && <p><strong>Related components:</strong> {record.linkedComponentIds.join(", ")}</p>}<button type="button" onClick={() => { setAdrDraft({ title: record.title, status: record.status, context: record.context, decision: record.decision, consequences: record.consequences, alternatives: record.alternatives, linkedComponentIds: record.linkedComponentIds.join(", ") }); setAdrMessage("Record copied into the editor. Save to create an updated record."); }}>Edit copy</button><button type="button" onClick={() => { const next = decisionRecords.filter((item) => item.id !== record.id); saveDecisionRecords(storage(), next); setDecisionRecords(next); setAdrMessage("Decision record deleted."); }}>Delete</button></article>) : <p>No decision records yet.</p>}</div>
    </section>
    <section id="architecture-review-dashboard-panel" className="architecture-review-dashboard" aria-label="Deployment review dashboard">
      <h2>Deployment review dashboard</h2>
      <div className="architecture-review-dashboard-grid">
        <article className="architecture-review-dashboard-card"><h3>Current findings</h3><strong>{reviewReport.summary.total}</strong><p>{reviewReport.summary.errors} errors · {reviewReport.summary.warnings} warnings · {reviewReport.summary.info} info</p><button type="button" className={`architecture-review-dashboard-link ${findingFilter === "unreviewed" ? "is-active" : ""}`} aria-pressed={findingFilter === "unreviewed"} onClick={() => { setFindingFilter("unreviewed"); setResourceFilter("all"); navigateToReviewSection("architecture-review-findings-panel"); setFindingQuery(""); }}>Show unreviewed findings</button></article>
        <article className="architecture-review-dashboard-card"><h3>Review coverage</h3><strong>{reviewProgressPercent}%</strong><div className="architecture-review-progress" role="progressbar" aria-label={`Diagram review readiness: ${reviewProgressPercent}% reviewed`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={reviewProgressPercent} aria-valuetext={`${reviewProgressPercent}% reviewed`}><span style={{ width: `${reviewProgressPercent}%` }} /></div><p>{reviewReport.summary.reviewed} of {reviewReport.summary.total} findings reviewed</p></article>
        <article className="architecture-review-dashboard-card"><h3>Remediation tasks</h3><strong>{remediationSummary.pending} pending</strong><p>{remediationSummary.completed} completed · {remediationSummary.resolved} resolved findings</p><button type="button" className={`architecture-review-dashboard-link ${remediationFilter === "pending" && !remediationQuery.trim() ? "is-active" : ""}`} aria-pressed={remediationFilter === "pending" && !remediationQuery.trim()} onClick={() => { setRemediationFilter("pending"); setRemediationQuery(""); navigateToReviewSection("architecture-remediation-checklist-panel"); }}>Show pending tasks</button>{remediationFilter === "pending" && !remediationQuery.trim() && <span>Showing pending tasks</span>}</article>
        <article className="architecture-review-dashboard-card"><h3>Saved review history</h3><strong>{reviewHistory.length}</strong><p>Up to 10 sanitized snapshots</p><button type="button" aria-expanded={showFullHistory} onClick={() => { setShowFullHistory(true); navigateToReviewSection("architecture-review-history-panel"); setHistoryVisible(true); }}>Open saved history</button></article>
      </div>
      <div className="architecture-review-dashboard-detail"><h3>Latest snapshot comparison</h3><p>{comparison ? `${comparison.counts.added} added · ${comparison.counts.changed} changed · ${comparison.counts.resolved} resolved` : "Select a saved snapshot to compare it with current findings."}</p><button type="button" onClick={() => { saveSnapshot(); setComparisonFilter("changed-only"); }} className="architecture-review-capture-baseline">Capture comparison baseline</button><button type="button" className={`architecture-review-dashboard-link ${comparisonFilter === "changed-only" ? "is-active" : ""}`} aria-pressed={comparisonFilter === "changed-only"} onClick={() => { setComparisonFilter("changed-only"); setComparisonResourceQuery(""); setComparisonSort("severity"); navigateToReviewSection("architecture-review-comparison-panel"); }}>Focus on changes</button>{comparisonFilter === "changed-only" && <span>Showing changes</span>}{hasActiveReviewViewFilters && <button type="button" onClick={() => { resetReviewView(); navigateToReviewSection("architecture-review-dashboard-panel"); }}>Reset review view</button>}</div>
      {dashboardMessage && <div className="architecture-review-filter-status" role="status" aria-live="polite" aria-atomic="true">{dashboardMessage}</div>}
    </section>

    <section id="architecture-review-findings-panel" className="architecture-review-section"><h2>Review findings</h2>
      <div className="architecture-review-filters"><label>Review status <select value={findingFilter} onChange={(event) => setFindingFilter(event.target.value)}><option value="all">All findings</option><option value="unreviewed">Not reviewed</option><option value="reviewed">Reviewed</option></select></label><label>Resource <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}><option value="all">All resources</option>{[...new Set(diagnostics.flatMap((item) => [item.resourceId, item.sourceResourceId, item.targetResourceId]).filter(Boolean))].map((id) => <option key={id} value={id}>{id}</option>)}</select></label><label>Search <input value={findingQuery} onChange={(event) => setFindingQuery(event.target.value)} placeholder="Find code, resource or message" /></label></div>
      <p className="architecture-review-filter-status" role="status" aria-live="polite" aria-atomic="true">{findingFilter === "unreviewed" ? "Showing unreviewed findings" : findingFilter === "reviewed" ? "Showing reviewed findings" : "Showing all findings"}: {visibleDiagnostics.length} of {diagnostics.length} findings.</p>
      <div className="architecture-review-active-filters" aria-label="Active finding filters">{hasActiveReviewViewFilters && <button type="button" onClick={resetFindingFilters}>Clear finding filters</button>}</div>
      {visibleDiagnostics.length ? <><DiagnosticGroup title="Errors" diagnostics={filteredErrors} onSelectDiagnostic={onSelectDiagnostic} onApplyKubernetesSuggestion={onApplyKubernetesSuggestion} canApplyCorrections={canApplyCorrections} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed}/><DiagnosticGroup title="Warnings" diagnostics={filteredWarnings} onSelectDiagnostic={onSelectDiagnostic} onApplyKubernetesSuggestion={onApplyKubernetesSuggestion} canApplyCorrections={canApplyCorrections} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed}/><DiagnosticGroup title="Info" diagnostics={filteredInfo} onSelectDiagnostic={onSelectDiagnostic} onApplyKubernetesSuggestion={onApplyKubernetesSuggestion} canApplyCorrections={canApplyCorrections} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed}/></> : <div className="architecture-review-empty">{allDiagnostics.length === 0 ? <><p>No Kubernetes findings are currently reported. No diagnostics are available for this diagram yet.</p><p>Resolved since last review: {resolvedFindings.length}. {resolvedFindings.map((entry) => entry.message).join("; ")}</p></> : hasFilteredFindings ? <p>No findings match the selected filters</p> : <p>No findings match the current filters.</p>}{resetFiltersAvailable && <button type="button" onClick={resetFindingFilters}>Reset finding filters</button>}</div>}
      <button type="button" onClick={() => downloadText("sketchizi-kubernetes-review.md", renderKubernetesDeploymentReviewMarkdown(reviewReport), "text/markdown")}>Export review as Markdown</button> <button type="button" onClick={() => downloadText("sketchizi-kubernetes-review.json", JSON.stringify(reviewReport, null, 2), "application/json")}>Export review as JSON</button> <span>Exports include review findings, not the diagram.</span>
    </section>

    <section id="architecture-review-history-panel" className="architecture-review-section"><h2>Saved review history</h2><p>Save a sanitized snapshot of Kubernetes findings for later comparison. Up to 10 sanitized snapshots are retained.</p><button type="button" onClick={saveSnapshot}>Save review snapshot</button> <button type="button" aria-expanded={showFullHistory} onClick={() => { setShowFullHistory((value) => !value); setHistoryVisible((value) => !value); }}>View history</button>
      {historyVisible && <div className="architecture-review-history-list">{historySummaries.length ? historySummaries.map((item) => <article key={item.id} className="architecture-review-history-item"><strong>{item.title}</strong><p>{new Date(item.savedAt).toLocaleString()} · {item.total} findings · {item.errors} errors · {item.warnings} warnings · {item.reviewed} reviewed</p><button type="button" onClick={() => { setSelectedSnapshotId(item.id); setComparisonReportPair({ baselineId: item.id, current: reviewReport }); }}>Compare</button><button type="button" onClick={() => { setSelectedSnapshotId(item.id); const result = deleteKubernetesReviewSnapshot(storage(), item.id); setReviewHistory(result.history); if (selectedSnapshotId === item.id) setSelectedSnapshotId(""); }}>Delete</button></article>) : <p>No saved review snapshots yet.</p>}</div>}
      <label>Compare with saved <select value={selectedSnapshotId} onChange={(event) => { setSelectedSnapshotId(event.target.value); setComparisonReportPair(event.target.value ? { baselineId: event.target.value, current: reviewReport } : null); }}><option value="">Choose a snapshot</option>{reviewHistory.map((entry) => <option key={entry.id} value={entry.id}>{new Date(entry.savedAt).toLocaleString()}</option>)}</select></label> <button type="button" onClick={removeSnapshot} disabled={!selectedSnapshotId}>Delete selected snapshot</button>
    </section>

    <section id="architecture-review-comparison-panel" className="architecture-review-section"><h2>Review comparison</h2>
      {comparison ? <><div className="architecture-review-comparison-summary"><div className="architecture-review-comparison-stat"><strong>{comparison.counts.added}</strong><span>Added</span></div><div className="architecture-review-comparison-stat"><strong>{comparison.counts.changed}</strong><span>Changed</span></div><div className="architecture-review-comparison-stat"><strong>{comparison.counts.resolved}</strong><span>Resolved</span></div><div className="architecture-review-comparison-stat"><strong>{comparison.counts.severityIncreased}</strong><span>severity increased</span></div></div><div className="architecture-review-active-filters" aria-label="Active comparison filters">{(comparisonFilter !== "all" || comparisonResourceQuery || comparisonSort !== "severity") && <button type="button" onClick={resetComparisonFilters}>Clear comparison filters</button>}</div><div className="architecture-review-comparison-filters"><label>Changes <select value={comparisonFilter} onChange={(event) => setComparisonFilter(event.target.value)}><option value="all">All changes</option><option value="changed-only">Changed only</option><option value="severity-increased">Severity increased</option><option value="remediation-changed">Remediation changed</option><option value="unresolved-errors">Unresolved errors</option></select></label><label>Resource search <input value={comparisonResourceQuery} onChange={(event) => setComparisonResourceQuery(event.target.value)} /></label><label>Sort <select value={comparisonSort} onChange={(event) => setComparisonSort(event.target.value)}><option value="severity">Severity</option><option value="name">Resource name</option></select></label><button type="button" className="architecture-review-reset-filters" onClick={clearComparisonFilters}>Reset comparison filters</button></div>{comparisonVisibleCount ? comparisonVisibleGroups.filter((group) => group.entries.length).map((group) => <section key={group.key}><h3>{group.title}</h3>{group.entries.map((entry) => { const groupKey = group.key; const currentMatch = diagnostics.find((item) => diagnosticId(item) === (entry.finding?.id || entry.finding?.diagnosticId)); return <article key={entry.identity} className={`architecture-review-comparison-item ${groupKey === "resolved" ? "is-resolved-comparison-item" : ""}`} data-group={groupKey}><span className="architecture-review-severity-badge">{entry.finding?.severity || entry.previous?.severity || "resolved"}</span><p>{entry.finding?.message || entry.previous?.message}</p>{currentMatch ? <button type="button" className="architecture-review-jump-button" onClick={() => onSelectDiagnostic?.(currentMatch)}>Go to finding</button> : <p className="architecture-review-comparison-navigation-note">No matching current canvas target was found; no current canvas target is available.</p>}</article>; })}</section>) : <div className="architecture-review-empty">No findings match the current comparison filters. <button type="button" onClick={clearComparisonFilters}>Reset comparison filters</button></div>}<button type="button" onClick={() => { setComparisonReportPair({ baselineId: selectedSnapshotId, current: reviewReport }); downloadComparisonReport("markdown"); }}>Export comparison as Markdown</button> <button type="button" onClick={() => downloadComparisonReport("json")}>Export comparison as JSON</button></> : <p>Select a saved snapshot to compare with the current review.</p>}
    </section>

    <section id="architecture-remediation-checklist-panel" className="architecture-review-section"><h2>Remediation checklist</h2><p>Track follow-up tasks manually. Completing a task does not modify the diagram or cluster.</p><button type="button" onClick={refreshRemediationTasks}>Refresh tasks from findings</button> <button type="button" onClick={() => exportChecklist("markdown")}>Export checklist as Markdown</button> <button type="button" onClick={() => exportChecklist("json")}>Export checklist as JSON</button><p role="status" aria-live="polite">{remediationMessage}</p><div className="architecture-review-active-filters" aria-label="Active remediation filters">{(remediationFilter !== "all" || remediationQuery) && <button type="button" onClick={resetRemediationFilters}>Clear task filters</button>}</div><div className="architecture-review-comparison-filters"><label>Task status <select value={remediationFilter} onChange={(event) => setRemediationFilter(event.target.value)}><option value="all">All tasks</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="resolved">Finding resolved</option><option value="active">Finding active</option><option value="pending-errors">Pending errors only</option></select></label><label>Search tasks <input value={remediationQuery} onChange={(event) => setRemediationQuery(event.target.value)} /></label><button type="button" className="architecture-review-reset-filters" onClick={clearRemediationFilters}>Reset task filters</button></div><div className="architecture-review-progress" role="progressbar" aria-label={`Remediation checklist: ${remediationSummary.progressPercent}% complete`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remediationSummary.progressPercent} aria-valuetext={`${remediationSummary.progressPercent}% complete`}><span style={{ width: `${remediationSummary.progressPercent}%` }} /></div><p>{remediationSummary.completed} of {remediationSummary.total} tasks complete · {remediationSummary.pendingResolved} pending tasks for resolved findings</p>{visibleTasks.length ? <ul className="architecture-remediation-task-list">{visibleTasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={task.status === "completed"} aria-label={`Mark remediation task ${task.code || "Finding"}`} onChange={() => toggleRemediationTask(task)} /> <strong>{task.code || "Finding"}</strong> — {task.message}</label><p>{task.findingPresent === false ? "Finding resolved" : "Finding active"}{task.remediation ? ` · ${task.remediation}` : ""}</p></li>)}</ul> : <div className="architecture-review-empty">No tasks match the current filters. <button type="button" onClick={clearRemediationFilters}>Reset task filters</button></div>}</section>

    <section className="architecture-review-section system-design-review-report"><h2>Architecture review report</h2><p>Export a shareable summary combining the current diagram structure, review findings, optional comparison, and local architecture decision records.</p><button type="button" onClick={() => { const report = buildSystemDesignReviewReport({ title: "Sketchizi Architecture Review", graph: currentSystemDesignGraph, comparison: systemComparison, diagnostics: allDiagnostics, decisionRecords }); downloadText("sketchizi-architecture-review.md", renderSystemDesignReviewReportMarkdown(report), "text/markdown"); }}>Export complete review (Markdown)</button> <button type="button" onClick={() => { const report = buildSystemDesignReviewReport({ title: "Sketchizi Architecture Review", graph: currentSystemDesignGraph, comparison: systemComparison, diagnostics: allDiagnostics, decisionRecords }); downloadText("sketchizi-architecture-review.json", JSON.stringify(report, null, 2), "application/json"); }}>Export complete review (JSON)</button><p>Reports contain advisory findings and heuristic comparisons; they are not a production-readiness certification.</p></section><section className="architecture-review-section system-design-review-workflow" aria-label="Architecture review workflow"><h2>Architecture review workflow</h2><p>Run a review lifecycle from draft through active review to a read-only finalized snapshot. Sessions are stored locally in this browser.</p>{workflowSession ? <><div className="architecture-review-workflow-summary"><strong>{workflowSession.title}</strong><span>Status: {workflowSession.status.replace("_", " ")}</span><span>{workflowSession.findings.length} findings · {workflowSession.decisions.length} decisions · {workflowSession.remediation.length} remediation tasks</span><span>{workflowSession.finalizedAt ? `Finalized ${workflowSession.finalizedAt}` : `Updated ${workflowSession.updatedAt}`}</span></div><label>Review notes <textarea value={workflowSession.notes} disabled={workflowSession.status === "finalized"} onChange={(event) => { try { setWorkflowSession(updateReviewSession(workflowSession, { notes: event.target.value })); } catch {} }} /></label><div className="architecture-review-workflow-actions"><button type="button" onClick={refreshWorkflowSnapshot} disabled={workflowSession.status === "finalized"}>Refresh snapshot from current diagram</button><button type="button" onClick={() => persistWorkflowSession(workflowSession)} disabled={workflowSession.status === "finalized"}>Save review</button><button type="button" onClick={() => { try { persistWorkflowSession(finalizeReviewSession(workflowSession)); } catch (error) { setWorkflowMessage(error.message); } }} disabled={workflowSession.status === "finalized"}>Finalize review</button><button type="button" onClick={() => downloadText("sketchizi-review-workflow.md", renderReviewSessionMarkdown(workflowSession), "text/markdown")}>Export review snapshot</button><button type="button" onClick={startWorkflowReview}>Start new review</button></div></> : <button type="button" onClick={startWorkflowReview}>Start architecture review</button>}<p role="status" aria-live="polite">{workflowMessage}</p><p>Finalized sessions are read-only. This workflow is a review record, not an infrastructure deployment or production-readiness certification.</p></section><section className="architecture-review-section"><h2>Executive review report</h2><p>Combined review metrics, snapshot changes and priority actions.</p><button type="button" onClick={() => downloadExecutiveReviewReport("markdown")}>Export executive report as Markdown</button> <button type="button" onClick={() => downloadExecutiveReviewReport("json")}>Export executive report as JSON</button></section>
  </section>;
}
