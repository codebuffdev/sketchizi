import { useEffect, useMemo, useRef, useState } from "react";
import { buildKubernetesDeploymentReadinessReport } from "../../features/architecture/kubernetesDeploymentReadinessReport.js";
import { buildKubernetesExecutiveReviewReport, renderKubernetesExecutiveReviewMarkdown } from "../../features/architecture/kubernetesExecutiveReviewReport.js";
import { buildKubernetesDeploymentReviewExport, renderKubernetesDeploymentReviewMarkdown } from "../../features/architecture/kubernetesDeploymentReviewExport.js";
import { compareKubernetesDeploymentReviews } from "../../features/architecture/kubernetesDeploymentReviewComparison.js";
import { buildKubernetesDeploymentReviewComparisonExport, renderKubernetesDeploymentReviewComparisonMarkdown } from "../../features/architecture/kubernetesDeploymentReviewComparisonExport.js";
import {
  buildKubernetesRemediationChecklistExport,
  loadKubernetesRemediationChecklist,
  renderKubernetesRemediationChecklistMarkdown,
  setKubernetesRemediationTaskStatus,
  summarizeKubernetesRemediationChecklist,
  syncKubernetesRemediationChecklist,
} from "../../features/architecture/kubernetesRemediationChecklist.js";
import { deleteKubernetesReviewSnapshot, loadKubernetesReviewHistory, saveKubernetesReviewSnapshot, summarizeKubernetesReviewHistory } from "../../features/architecture/kubernetesDeploymentReviewHistory.js";

function getReviewStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function diagnosticIdentity(diagnostic) {
  return diagnostic.diagnosticId || [diagnostic.code || "", diagnostic.resourceId || "", diagnostic.relationshipId || ""].join("|");
}

function diagnosticFingerprint(diagnostic) {
  return JSON.stringify([
    diagnostic.code || "",
    diagnostic.severity || "",
    diagnostic.message || "",
    diagnostic.remediation || "",
    diagnostic.resourceId || "",
    diagnostic.relationshipId || "",
    diagnostic.relationshipType || "",
    diagnostic.sourceResourceId || "",
    diagnostic.targetResourceId || "",
    diagnostic.sourceResourceType || "",
    diagnostic.targetResourceType || "",
  ]);
}

function DiagnosticGroup({ title, diagnostics, onSelectDiagnostic, onApplyKubernetesSuggestion, canApplyCorrections, reviewedFindings = new Map(), onToggleReviewed }) {
  if (!diagnostics.length) return null;

  return (
    <section className={`architecture-validation-section severity-${title.toLowerCase()}`}>
      <div className="architecture-validation-section-title">
        <span>{title}</span>
        <span className="architecture-validation-count">{diagnostics.length}</span>
      </div>
      <div className="architecture-validation-list">
        {diagnostics.map((diagnostic) => {
          const selectable = Boolean(diagnostic.relationshipId || diagnostic.resourceId);
          const showKubernetesFixes = Boolean(
            canApplyCorrections &&
            diagnostic.provider === "kubernetes" &&
            diagnostic.relationshipId &&
            ["KUBERNETES_INVALID_RELATIONSHIP", "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE"].includes(diagnostic.code) &&
            Array.isArray(diagnostic.suggestedRelationshipTypes) &&
            diagnostic.suggestedRelationshipTypes.length > 0 &&
            diagnostic.sourceResourceType && diagnostic.targetResourceType,
          );
          const content = (
            <>
              <div className="architecture-validation-diagnostic-message">{diagnostic.message}</div>
              {diagnostic.code === "KUBERNETES_INVALID_RELATIONSHIP" && (
                <div className="architecture-validation-diagnostic-details">
                  <span>{diagnostic.sourceResourceType || diagnostic.sourceResourceId || "Unknown source"}</span>
                  <span aria-hidden="true">→</span>
                  <span>{diagnostic.targetResourceType || diagnostic.targetResourceId || "Unknown target"}</span>
                  {diagnostic.relationshipType && <span>Type: {diagnostic.relationshipType}</span>}
                </div>
              )}
              {diagnostic.code === "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE" && diagnostic.relationshipType && (
                <div className="architecture-validation-diagnostic-details">
                  Type: {diagnostic.relationshipType}
                </div>
              )}
              {diagnostic.remediation && (
                <div className="architecture-validation-diagnostic-remediation">
                  <strong>How to fix:</strong> {diagnostic.remediation}
                </div>
              )}
              <div className="architecture-validation-diagnostic-meta">
                {diagnostic.provider && <span className="architecture-validation-provider">{diagnostic.provider}</span>}
                <span className="architecture-validation-diagnostic-code">{diagnostic.code}</span>
              </div>
            </>
          );

          return (
            <article className="architecture-validation-diagnostic" key={diagnostic.diagnosticId}>
              {selectable ? (
                <button
                  type="button"
                  className="architecture-validation-diagnostic-action"
                  onClick={() => onSelectDiagnostic?.(diagnostic)}
                  title="Select affected canvas element"
                >
                  {content}
                </button>
              ) : content}
              {Array.isArray(diagnostic.suggestedRelationshipTypes) && diagnostic.suggestedRelationshipTypes.length > 0 && (
                <div className="architecture-validation-diagnostic-suggestions">
                  <strong>Suggested types:</strong> {diagnostic.suggestedRelationshipTypes.join(", ")}
                </div>
              )}
              <div className="architecture-review-finding-actions">
                <span className={reviewedFindings.get(diagnosticIdentity(diagnostic))?.fingerprint === diagnosticFingerprint(diagnostic) ? "architecture-review-reviewed-state" : "architecture-review-unreviewed-state"}>
                  {reviewedFindings.get(diagnosticIdentity(diagnostic))?.fingerprint === diagnosticFingerprint(diagnostic) ? "Reviewed" : "Not reviewed"}
                </span>
                <button
                  type="button"
                  className="architecture-review-toggle"
                  onClick={() => onToggleReviewed?.(diagnostic)}
                  aria-pressed={reviewedFindings.get(diagnosticIdentity(diagnostic))?.fingerprint === diagnosticFingerprint(diagnostic)}
                >
                  {reviewedFindings.get(diagnosticIdentity(diagnostic))?.fingerprint === diagnosticFingerprint(diagnostic) ? "Mark not reviewed" : "Mark reviewed"}
                </button>
              </div>
              {showKubernetesFixes && (
                <div className="architecture-validation-diagnostic-fix">
                  <div className="architecture-validation-diagnostic-fix-title">Apply a compatible type</div>
                  <div className="architecture-validation-diagnostic-fix-actions">
                    {diagnostic.suggestedRelationshipTypes.map((relationshipType) => (
                      <button
                        key={relationshipType}
                        type="button"
                        className="architecture-validation-fix-button"
                        onClick={() => onApplyKubernetesSuggestion?.(diagnostic, relationshipType)}
                        aria-label={`Correct relationship to ${relationshipType}`}
                      >
                        Use {relationshipType}
                      </button>
                    ))}
                  </div>
                  <div className="architecture-validation-diagnostic-fix-note">You’ll be asked to confirm before the canvas changes.</div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ArchitectureValidationPanel({ validation, onClose, onSelectDiagnostic, onApplyKubernetesSuggestion, canApplyCorrections = false }) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const info = validation?.info || [];
  const hasDiagnostics = errors.length > 0 || warnings.length > 0 || info.length > 0;
  const sharedProps = { onSelectDiagnostic, onApplyKubernetesSuggestion, canApplyCorrections };
  const readiness = buildKubernetesDeploymentReadinessReport(validation);
  const [reviewedFindings, setReviewedFindings] = useState(() => new Map());
  const [resolvedFindings, setResolvedFindings] = useState([]);
  const previousDiagnosticsRef = useRef(new Map());
  const [findingFilter, setFindingFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [comparisonBaseline, setComparisonBaseline] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [comparisonReportPair, setComparisonReportPair] = useState(null);
  const [comparisonFilter, setComparisonFilter] = useState("all");
  const [comparisonResourceQuery, setComparisonResourceQuery] = useState("");
  const [comparisonSort, setComparisonSort] = useState("severity");
  const [remediationTasks, setRemediationTasks] = useState([]);
  const [remediationMessage, setRemediationMessage] = useState("");
  const [remediationFilter, setRemediationFilter] = useState("all");
  const [remediationQuery, setRemediationQuery] = useState("");
  const [savedReviewHistory, setSavedReviewHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const historySummaries = useMemo(() => summarizeKubernetesReviewHistory(savedReviewHistory), [savedReviewHistory]);
  const remediationSummary = useMemo(() => summarizeKubernetesRemediationChecklist(remediationTasks), [remediationTasks]);
  const visibleRemediationTasks = useMemo(() => {
    const query = remediationQuery.trim().toLowerCase();
    return remediationTasks.filter((task) => {
      if (remediationFilter === "pending" && task.status !== "pending") return false;
      if (remediationFilter === "completed" && task.status !== "completed") return false;
      if (remediationFilter === "errors" && (task.severity !== "error" || task.status !== "pending")) return false;
      if (remediationFilter === "resolved" && task.findingPresent !== false) return false;
      if (remediationFilter === "active" && task.findingPresent === false) return false;
      if (query && ![task.code, task.resourceId, task.message, task.remediation].some((value) => String(value || "").toLowerCase().includes(query))) return false;
      return true;
    }).sort((a, b) => {
      const rank = { error: 0, warning: 1, info: 2 };
      return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || a.code.localeCompare(b.code);
    });
  }, [remediationTasks, remediationFilter, remediationQuery]);
  const hasActiveReviewViewFilters = findingFilter !== "all"
    || resourceFilter !== "all"
    || comparisonFilter !== "all"
    || Boolean(comparisonResourceQuery.trim())
    || comparisonSort !== "severity"
    || remediationFilter !== "all"
    || Boolean(remediationQuery.trim());
  const allDiagnostics = useMemo(() => [...errors, ...warnings, ...info], [errors, warnings, info]);
  const comparisonVisibleGroups = useMemo(() => {
    if (!comparisonResult) return [];
    const groups = [
      { key: "added", heading: "New findings", entries: comparisonResult.added || [] },
      { key: "changed", heading: "Changed findings", entries: comparisonResult.changed || [] },
      { key: "resolved", heading: "Resolved findings", entries: comparisonResult.resolved || [] },
      { key: "unchanged", heading: "Unchanged findings", entries: comparisonResult.unchanged || [] },
    ];
    const severityRank = { error: 0, warning: 1, info: 2 };
    const query = comparisonResourceQuery.trim().toLowerCase();
    return groups.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => {
        const finding = entry.finding || entry.previous || {};
        const severity = String(finding.severity || "").toLowerCase();
        const resource = String(finding.resourceId || finding.sourceResourceId || finding.targetResourceId || "");
        if (query && !resource.toLowerCase().includes(query) &&
            !String(finding.code || "").toLowerCase().includes(query) &&
            !String(finding.message || "").toLowerCase().includes(query)) return false;
        if (comparisonFilter === "severity-increased") {
          return Boolean(entry.changes?.severity) &&
            (severityRank[String(entry.finding?.severity || "").toLowerCase()] ?? 3) <
            (severityRank[String(entry.previous?.severity || "").toLowerCase()] ?? 3);
        }
        if (comparisonFilter === "remediation-changed") return Boolean(entry.changes?.remediation);
        if (comparisonFilter === "unresolved-errors") {
          return group.key !== "resolved" && severity === "error";
        }
        if (comparisonFilter === "changed-only") return group.key !== "unchanged";
        return true;
      }).sort((a, b) => {
        const left = a.finding || a.previous || {};
        const right = b.finding || b.previous || {};
        if (comparisonSort === "code") return String(left.code || "").localeCompare(String(right.code || ""));
        if (comparisonSort === "resource") return String(left.resourceId || left.sourceResourceId || "").localeCompare(String(right.resourceId || right.sourceResourceId || ""));
        const severityDifference = (severityRank[String(left.severity || "").toLowerCase()] ?? 3) -
          (severityRank[String(right.severity || "").toLowerCase()] ?? 3);
        return severityDifference || String(left.code || "").localeCompare(String(right.code || ""));
      }),
    })).filter((group) => group.entries.length > 0);
  }, [comparisonResult, comparisonFilter, comparisonResourceQuery, comparisonSort]);
  const currentDiagnostics = useMemo(() => new Map(allDiagnostics.map((item) => [
    diagnosticIdentity(item),
    { diagnostic: item, fingerprint: diagnosticFingerprint(item) },
  ])), [allDiagnostics]);
  useEffect(() => {
    if (!validation) return;
    const previous = previousDiagnosticsRef.current;
    const newlyResolved = [];
    for (const [id, previousEntry] of previous.entries()) {
      const current = currentDiagnostics.get(id);
      if (!current || current.fingerprint !== previousEntry.fingerprint) {
        newlyResolved.push({
          id: `${id}::${previousEntry.fingerprint}`,
          diagnostic: previousEntry.diagnostic,
          resolvedReason: current ? "changed" : "cleared",
        });
      }
    }
    if (newlyResolved.length) {
      setResolvedFindings((existing) => {
        const merged = new Map(existing.map((entry) => [entry.id, entry]));
        for (const entry of newlyResolved) merged.set(entry.id, entry);
        return [...merged.values()];
      });
      setReviewedFindings((existing) => {
        const next = new Map(existing);
        for (const entry of newlyResolved) {
          const key = diagnosticIdentity(entry.diagnostic);
          if (next.get(key)?.fingerprint === diagnosticFingerprint(entry.diagnostic)) next.delete(key);
        }
        return next;
      });
    }
    previousDiagnosticsRef.current = currentDiagnostics;
  }, [validation, currentDiagnostics]);
  useEffect(() => {
    setSavedReviewHistory(loadKubernetesReviewHistory(getReviewStorage()));
  }, []);
  useEffect(() => {
    const result = loadKubernetesRemediationChecklist(getReviewStorage());
    setRemediationTasks(result.tasks);
    if (!result.ok) setRemediationMessage("Could not load the saved checklist from this browser.");
  }, []);
  const resourceOptions = useMemo(() => {
    const ids = [...new Set(allDiagnostics.flatMap((item) => [item.resourceId, item.sourceResourceId, item.targetResourceId]).filter(Boolean))].sort();
    return ids;
  }, [allDiagnostics]);
  const visibleDiagnostics = useMemo(() => allDiagnostics.filter((item) => {
    const id = item.diagnosticId || [item.code || "", item.resourceId || "", item.relationshipId || ""].join("|");
    const reviewed = reviewedFindings.get(id)?.fingerprint === diagnosticFingerprint(item);
    if (findingFilter === "unreviewed" && reviewed) return false;
    if (findingFilter === "reviewed" && !reviewed) return false;
    if (resourceFilter !== "all" && ![item.resourceId, item.sourceResourceId, item.targetResourceId].includes(resourceFilter)) return false;
    return true;
  }), [allDiagnostics, findingFilter, resourceFilter, reviewedFindings]);
  const visibleErrors = visibleDiagnostics.filter((item) => errors.includes(item));
  const visibleWarnings = visibleDiagnostics.filter((item) => warnings.includes(item));
  const visibleInfo = visibleDiagnostics.filter((item) => info.includes(item));
  const reviewedCount = allDiagnostics.filter((item) => reviewedFindings.get(diagnosticIdentity(item))?.fingerprint === diagnosticFingerprint(item)).length;
  const unreviewedCount = allDiagnostics.length - reviewedCount;
  const reviewProgressPercent = allDiagnostics.length ? Math.round((reviewedCount / allDiagnostics.length) * 100) : 100;
  const comparisonSummary = comparisonResult ? {
    added: (comparisonResult.added || []).length,
    changed: (comparisonResult.changed || []).length,
    resolved: (comparisonResult.resolved || []).length,
    unchanged: (comparisonResult.unchanged || []).length,
  } : null;
  const toggleReviewed = (diagnostic) => {
    const id = diagnosticIdentity(diagnostic);
    const fingerprint = diagnosticFingerprint(diagnostic);
    setReviewedFindings((previous) => {
      const next = new Map(previous);
      if (next.get(id)?.fingerprint === fingerprint) next.delete(id);
      else next.set(id, { fingerprint, reviewedAt: Date.now() });
      return next;
    });
  };
  const dismissResolved = (resolvedId) => setResolvedFindings((previous) => previous.filter((entry) => entry.id !== resolvedId));
  const refreshRemediationChecklist = () => {
    const result = syncKubernetesRemediationChecklist(getReviewStorage(), allDiagnostics);
    if (result.ok) {
      setRemediationTasks(result.tasks);
      setRemediationMessage("Checklist refreshed from current Kubernetes findings. Existing task statuses were preserved.");
    } else {
      setRemediationMessage("Could not save the checklist. Browser storage may be unavailable or full.");
    }
  };
  const navigateToReviewSection = (sectionId) => {
    if (typeof document === "undefined") return;
    const prefersReducedMotion = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const resetReviewView = () => {
    setFindingFilter("all");
    setResourceFilter("all");
    setComparisonFilter("all");
    setComparisonResourceQuery("");
    setComparisonSort("severity");
    setRemediationFilter("all");
    setRemediationQuery("");
  };

  const toggleRemediationTask = (task) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    const result = setKubernetesRemediationTaskStatus(getReviewStorage(), remediationTasks, task.id, nextStatus);
    setRemediationTasks(result.tasks);
    setRemediationMessage(result.ok
      ? `${task.code || "Finding"} marked ${nextStatus}.`
      : "Could not persist the checklist update in this browser.");
  };
  const downloadRemediationChecklist = (format) => {
    const report = buildKubernetesRemediationChecklistExport(remediationTasks);
    const isMarkdown = format === "markdown";
    const contents = isMarkdown ? renderKubernetesRemediationChecklistMarkdown(report) : JSON.stringify(report, null, 2);
    const blob = new Blob([contents], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-kubernetes-remediation-checklist-${new Date().toISOString().slice(0, 10)}.${isMarkdown ? "md" : "json"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const createCurrentReviewSnapshot = () => buildKubernetesDeploymentReviewExport({
    validation, resolvedFindings, reviewedFindings,
  });
  const captureComparisonBaseline = () => {
    const snapshot = createCurrentReviewSnapshot();
    setComparisonBaseline(snapshot);
    setComparisonResult(null);
    setComparisonReportPair(null);
  };
  const saveCurrentReviewSnapshot = () => {
    const result = saveKubernetesReviewSnapshot(getReviewStorage(), createCurrentReviewSnapshot());
    setSavedReviewHistory(result.history);
    if (result.ok && result.history[0]) {
      setSelectedHistoryId(result.history[0].id);
      setHistoryMessage("Snapshot saved in this browser.");
    } else {
      setHistoryMessage("Could not save snapshot. Browser storage may be unavailable or full.");
    }
  };
  const compareWithSavedSnapshot = () => {
    const selected = savedReviewHistory.find((entry) => entry.id === selectedHistoryId);
    if (!selected) {
      setHistoryMessage("Choose a saved snapshot to compare.");
      return;
    }
    const baseline = selected.snapshot;
    const current = createCurrentReviewSnapshot();
    setComparisonReportPair({ baseline, current });
    setComparisonResult(compareKubernetesDeploymentReviews(baseline, current));
    setHistoryMessage(`Compared with snapshot saved ${new Date(selected.savedAt).toLocaleString()}.`);
  };
  const deleteSavedSnapshot = (snapshotId) => {
    const result = deleteKubernetesReviewSnapshot(getReviewStorage(), snapshotId);
    setSavedReviewHistory(result.history);
    if (selectedHistoryId === snapshotId) setSelectedHistoryId("");
    setHistoryMessage(result.ok ? "Saved snapshot deleted." : "Could not update browser storage.");
  };
  const compareWithBaseline = () => {
    if (!comparisonBaseline) return;
    const currentSnapshot = createCurrentReviewSnapshot();
    setComparisonReportPair({ baseline: comparisonBaseline, current: currentSnapshot });
    setComparisonResult(compareKubernetesDeploymentReviews(comparisonBaseline, currentSnapshot));
  };
  const downloadComparisonReport = (format) => {
    if (!comparisonResult || !comparisonReportPair) return;
    const report = buildKubernetesDeploymentReviewComparisonExport({
      comparison: comparisonResult,
      baseline: comparisonReportPair.baseline,
      current: comparisonReportPair.current,
    });
    const isMarkdown = format === "markdown";
    const contents = isMarkdown
      ? renderKubernetesDeploymentReviewComparisonMarkdown(report)
      : JSON.stringify(report, null, 2);
    const blob = new Blob([contents], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-kubernetes-review-comparison-${new Date().toISOString().slice(0, 10)}.${isMarkdown ? "md" : "json"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const downloadExecutiveReviewReport = (format) => {
    const reviewReport = createCurrentReviewSnapshot();
    const report = buildKubernetesExecutiveReviewReport({
      reviewReport,
      readiness,
      comparison: comparisonResult,
      remediationTasks,
    });
    const isMarkdown = format === "markdown";
    const contents = isMarkdown ? renderKubernetesExecutiveReviewMarkdown(report) : JSON.stringify(report, null, 2);
    const blob = new Blob([contents], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-kubernetes-executive-review-${new Date().toISOString().slice(0, 10)}.${isMarkdown ? "md" : "json"}`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadReviewReport = (format) => {
    const report = buildKubernetesDeploymentReviewExport({
      validation,
      resolvedFindings,
      reviewedFindings,
    });
    const isMarkdown = format === "markdown";
    const contents = isMarkdown ? renderKubernetesDeploymentReviewMarkdown(report) : JSON.stringify(report, null, 2);
    const blob = new Blob([contents], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-kubernetes-review-${new Date().toISOString().slice(0, 10)}.${isMarkdown ? "md" : "json"}`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="architecture-validation-panel" aria-label="Architecture Validation">
      <header className="architecture-validation-header">
        <div>
          <div className="architecture-validation-title">Architecture Validation</div>
          <div className="architecture-validation-subtitle">Current canvas diagnostics</div>
        </div>
        <button
          type="button"
          className="architecture-validation-close"
          onClick={onClose}
          aria-label="Close architecture validation"
        >×</button>
      </header>

      {!hasDiagnostics && resolvedFindings.length === 0 ? (
        <div className="architecture-validation-empty">No architecture issues detected.</div>
      ) : (
        <div className="architecture-validation-content">
          {readiness.counts.total > 0 && (
            <section className={`architecture-readiness-summary status-${readiness.status}`} aria-label="Kubernetes Deployment Readiness">
              <div className="architecture-readiness-summary-title">{readiness.title}</div>
              <div className="architecture-readiness-summary-status">{readiness.summary}</div>
              <div className="architecture-readiness-summary-note">{readiness.scopeNote}</div>
            </section>
          )}
          <section id="architecture-review-dashboard-panel" className="architecture-review-dashboard" aria-label="Kubernetes deployment review dashboard">
            <div className="architecture-review-dashboard-heading">
              <div>
                <strong>Deployment review dashboard</strong>
                <span>One summary of the current diagram review, saved history, comparisons, and remediation workflow.</span>
              </div>
              <span className={`architecture-review-dashboard-status status-${readiness.status || "unknown"}`} role="status" aria-label={`Diagram review readiness: ${readiness.title || "unavailable"}`}>{readiness.title || "Review status unavailable"}</span>
              {hasActiveReviewViewFilters && (
                <button
                  type="button"
                  className="architecture-review-reset-filters architecture-review-reset-view"
                  onClick={() => { resetReviewView(); navigateToReviewSection("architecture-review-dashboard-panel"); }}
                  aria-label="Reset all review filters, searches, and sorting"
                >Reset review view</button>
              )}
            </div>
            <div className="architecture-review-dashboard-grid">
              <article className="architecture-review-dashboard-card">
                <span className="architecture-review-dashboard-label">Current findings</span>
                <strong>{allDiagnostics.length}</strong>
                <small>{errors.length} errors · {warnings.length} warnings · {info.length} info</small>
              </article>
              <article className="architecture-review-dashboard-card">
                <span className="architecture-review-dashboard-label">Review coverage</span>
                <strong>{reviewProgressPercent}%</strong>
                <small className="architecture-review-dashboard-detail">{reviewedCount} reviewed · {unreviewedCount} need review</small>
                <div className="architecture-review-dashboard-progress" role="progressbar" aria-label="Findings review coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={reviewProgressPercent} aria-valuetext={`${reviewProgressPercent}% reviewed; ${reviewedCount} reviewed, ${unreviewedCount} needing review`}>
                  <span style={{ width: `${reviewProgressPercent}%` }} />
                </div>
                {unreviewedCount > 0 && <button type="button" className={`architecture-review-dashboard-link${findingFilter === "unreviewed" ? " is-active" : ""}`} aria-pressed={findingFilter === "unreviewed"} onClick={() => { setFindingFilter("unreviewed"); setResourceFilter("all"); navigateToReviewSection("architecture-review-findings-panel"); }}>{findingFilter === "unreviewed" ? "Showing unreviewed findings" : "Show unreviewed findings"}</button>}
              </article>
              <article className="architecture-review-dashboard-card">
                <span className="architecture-review-dashboard-label">Remediation tasks</span>
                <strong>{remediationSummary.progressPercent}%</strong>
                <small className="architecture-review-dashboard-detail">{remediationSummary.completed} completed · {remediationSummary.pending} pending</small>
                <div className="architecture-review-dashboard-progress" role="progressbar" aria-label="Remediation checklist completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={remediationSummary.progressPercent} aria-valuetext={`${remediationSummary.progressPercent}% complete; ${remediationSummary.completed} completed, ${remediationSummary.pending} pending`}>
                  <span style={{ width: `${remediationSummary.progressPercent}%` }} />
                </div>
                <small>{remediationSummary.active} active · {remediationSummary.resolved} resolved findings</small>
                {remediationSummary.pending > 0 && <button type="button" className={`architecture-review-dashboard-link${remediationFilter === "pending" && !remediationQuery.trim() ? " is-active" : ""}`} aria-pressed={remediationFilter === "pending" && !remediationQuery.trim()} onClick={() => { setRemediationFilter("pending"); setRemediationQuery(""); navigateToReviewSection("architecture-remediation-checklist-panel"); }}>{remediationFilter === "pending" && !remediationQuery.trim() ? "Showing pending tasks" : "Show pending tasks"}</button>}
              </article>
              <article className="architecture-review-dashboard-card">
                <span className="architecture-review-dashboard-label">Saved review history</span>
                <strong>{savedReviewHistory.length}/10</strong>
                <small>{historySummaries.length ? `${historySummaries[0].total} findings in the latest saved snapshot` : "No saved snapshots yet"}</small>
                <button type="button" className="architecture-review-dashboard-link" aria-expanded={showFullHistory} onClick={() => { setShowFullHistory(true); navigateToReviewSection("architecture-review-history-panel"); }}>{showFullHistory ? "History open" : "Open saved history"}</button>
              </article>
            </div>
            {comparisonSummary && (
              <div className="architecture-review-dashboard-comparison" aria-label="Latest comparison summary">
                <strong>Latest snapshot comparison</strong>
                <span>{comparisonSummary.added} new · {comparisonSummary.changed} changed · {comparisonSummary.resolved} resolved · {comparisonSummary.unchanged} unchanged</span>
                <button type="button" className={`architecture-review-dashboard-link${comparisonFilter === "changed-only" ? " is-active" : ""}`} aria-pressed={comparisonFilter === "changed-only"} onClick={() => { setComparisonFilter("changed-only"); setComparisonResourceQuery(""); setComparisonSort("severity"); navigateToReviewSection("architecture-review-comparison-panel"); }}>{comparisonFilter === "changed-only" ? "Showing changes" : "Focus on changes"}</button>
              </div>
            )}
            <p className="architecture-review-dashboard-note">These metrics describe diagram-validation findings and manually tracked review tasks. They do not inspect a live Kubernetes cluster or certify deployment readiness.</p>
          </section>
          <section className="architecture-review-executive-export" aria-label="Export executive review report">
            <div className="architecture-review-export-copy">
              <strong>Executive review report</strong>
              <span>Combines readiness assessment, priority actions, review coverage, comparison results, and remediation status.</span>
            </div>
            <div className="architecture-review-export-actions">
              <button type="button" className="architecture-review-export-button" onClick={() => downloadExecutiveReviewReport("markdown")}>Export executive report as Markdown</button>
              <button type="button" className="architecture-review-export-button" onClick={() => downloadExecutiveReviewReport("json")}>Export executive report as JSON</button>
            </div>
          </section>
          <section className="architecture-review-export" aria-label="Export deployment review">
            <div className="architecture-review-export-copy">
              <strong>Share review report</strong>
              <span>Exports Kubernetes findings and review history, not the diagram.</span>
            </div>
            <div className="architecture-review-export-actions">
              <button type="button" className="architecture-review-export-button" onClick={() => downloadReviewReport("markdown")}>Export review as Markdown</button>
              <button type="button" className="architecture-review-export-button" onClick={() => downloadReviewReport("json")}>Export review as JSON</button>
            </div>
          </section>
          <section id="architecture-review-comparison-panel" className="architecture-review-comparison" aria-label="Compare deployment review snapshots">
            <div className="architecture-review-export-copy">
              <strong>Compare validation snapshots</strong>
              <span>{comparisonBaseline ? "A baseline is captured for this open review panel." : "Capture the current findings as a baseline, then compare after revalidation."}</span>
            </div>
            <div className="architecture-review-export-actions">
              <button type="button" className="architecture-review-export-button" onClick={captureComparisonBaseline}>Capture comparison baseline</button>
              <button type="button" className="architecture-review-export-button" onClick={compareWithBaseline} disabled={!comparisonBaseline}>Compare with baseline</button>
              <button type="button" className="architecture-review-export-button" onClick={saveCurrentReviewSnapshot}>Save review snapshot</button>
            </div>
            <div id="architecture-review-history-panel" className="architecture-review-history-heading">
              <div className="architecture-review-export-copy">
                <strong>Saved review history</strong>
                <span>{savedReviewHistory.length} of 10 snapshots saved in this browser</span>
              </div>
              <button type="button" className="architecture-review-export-button" onClick={() => setShowFullHistory((value) => !value)}>
                {showFullHistory ? "Hide history" : "View history"}
              </button>
            </div>
            {showFullHistory && (
              <div className="architecture-review-history-list">
                {historySummaries.length === 0 ? (
                  <p className="architecture-review-history-empty">No saved review snapshots yet. Select Save review snapshot to start a history.</p>
                ) : historySummaries.map((entry) => (
                  <article className={`architecture-review-history-card${selectedHistoryId === entry.id ? " is-selected" : ""}`} key={entry.id}>
                    <div className="architecture-review-history-card-top">
                      <label className="architecture-review-history-select">
                        <input type="radio" name="kubernetes-review-history" checked={selectedHistoryId === entry.id} onChange={() => setSelectedHistoryId(entry.id)} />
                        <span>
                          <strong>{new Date(entry.savedAt).toLocaleString()}</strong>
                          <small>{entry.total} total finding{entry.total === 1 ? "" : "s"}</small>
                        </span>
                      </label>
                      <span className="architecture-review-history-reviewed">{entry.reviewed}/{entry.total} reviewed</span>
                    </div>
                    <div className="architecture-review-history-severity">
                      <span className="severity-error"><strong>{entry.errors}</strong> errors</span>
                      <span className="severity-warning"><strong>{entry.warnings}</strong> warnings</span>
                      <span className="severity-info"><strong>{entry.info}</strong> info</span>
                      {entry.resolved > 0 && <span><strong>{entry.resolved}</strong> resolved</span>}
                    </div>
                    {entry.unreviewed > 0 && <p className="architecture-review-history-unreviewed">{entry.unreviewed} finding{entry.unreviewed === 1 ? "" : "s"} still need review</p>}
                    <div className="architecture-review-export-actions">
                      <button type="button" className="architecture-review-export-button" onClick={() => { setSelectedHistoryId(entry.id); const selected = savedReviewHistory.find((item) => item.id === entry.id); if (selected) { setComparisonResult(compareKubernetesDeploymentReviews(selected.snapshot, createCurrentReviewSnapshot())); setHistoryMessage("Compared with selected saved snapshot."); } }}>Compare</button>
                      <button type="button" className="architecture-review-export-button" onClick={() => deleteSavedSnapshot(entry.id)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {selectedHistoryId && (
              <div className="architecture-review-history-selected-actions">
                <span>Selected snapshot: {historySummaries.find((entry) => entry.id === selectedHistoryId)?.total ?? 0} findings</span>
                <div className="architecture-review-export-actions">
                  <button type="button" className="architecture-review-export-button" onClick={compareWithSavedSnapshot}>Compare with saved</button>
                  <button type="button" className="architecture-review-export-button" onClick={() => deleteSavedSnapshot(selectedHistoryId)}>Delete selected snapshot</button>
                </div>
              </div>
            )}
            {historyMessage && <p className="architecture-review-history-message" role="status">{historyMessage}</p>}
            <p className="architecture-review-history-note">Up to 10 sanitized snapshots are stored in this browser only. They are not synced across browsers or devices.</p>
            {comparisonResult && (
              <div className="architecture-review-comparison-result">
                <div className="architecture-review-comparison-summary" aria-label="Comparison summary">
                  <div className="architecture-review-comparison-stat stat-added"><strong>{comparisonResult.counts.added}</strong><span>New</span></div>
                  <div className="architecture-review-comparison-stat stat-changed"><strong>{comparisonResult.counts.changed}</strong><span>Changed</span></div>
                  <div className="architecture-review-comparison-stat stat-resolved"><strong>{comparisonResult.counts.resolved}</strong><span>Resolved</span></div>
                  <div className="architecture-review-comparison-stat stat-unchanged"><strong>{comparisonResult.counts.unchanged}</strong><span>Unchanged</span></div>
                </div>
                <p className="architecture-review-comparison-headline">
                  {comparisonResult.counts.added + comparisonResult.counts.changed + comparisonResult.counts.resolved === 0
                    ? "No differences found between these reviews."
                    : `${comparisonResult.counts.added + comparisonResult.counts.changed + comparisonResult.counts.resolved} finding(s) changed or resolved; ${comparisonResult.counts.unchanged} unchanged.`}
                </p>
                {(comparisonResult.counts.severityIncreased > 0 || comparisonResult.counts.severityDecreased > 0) && (
                  <div className="architecture-review-severity-summary" aria-label="Severity changes">
                    {comparisonResult.counts.severityIncreased > 0 && <span className="severity-change severity-up"><strong>↑ {comparisonResult.counts.severityIncreased}</strong> severity increased</span>}
                    {comparisonResult.counts.severityDecreased > 0 && <span className="severity-change severity-down"><strong>↓ {comparisonResult.counts.severityDecreased}</strong> severity decreased</span>}
                  </div>
                )}
                <p>{comparisonResult.scopeNote}</p>
                <div className="architecture-review-export-actions">
                  <button type="button" className="architecture-review-export-button" onClick={() => downloadComparisonReport("markdown")} disabled={!comparisonReportPair}>Export comparison as Markdown</button>
                  <button type="button" className="architecture-review-export-button" onClick={() => downloadComparisonReport("json")} disabled={!comparisonReportPair}>Export comparison as JSON</button>
                </div>
                <div className="architecture-review-comparison-filters" aria-label="Filter and sort comparison findings">
                  <label>
                    Show
                    <select value={comparisonFilter} onChange={(event) => setComparisonFilter(event.target.value)}>
                      <option value="all">All changes</option>
                      <option value="changed-only">Changed and resolved</option>
                      <option value="severity-increased">Severity increased</option>
                      <option value="remediation-changed">Remediation changed</option>
                      <option value="unresolved-errors">Unresolved errors</option>
                    </select>
                  </label>
                  <label className="architecture-review-comparison-resource-filter">
                    Find resource or text
                    <input type="search" value={comparisonResourceQuery} onChange={(event) => setComparisonResourceQuery(event.target.value)} placeholder="Resource ID, code, or message" />
                  </label>
                  <label>
                    Sort by
                    <select value={comparisonSort} onChange={(event) => setComparisonSort(event.target.value)}>
                      <option value="severity">Severity</option>
                      <option value="code">Finding code</option>
                      <option value="resource">Resource</option>
                    </select>
                  </label>
                </div>
                {(comparisonFilter !== "all" || comparisonResourceQuery.trim() || comparisonSort !== "severity") && (
                  <div className="architecture-review-active-filters" aria-label="Active comparison filters">
                    <span><strong>Active filters:</strong> {comparisonFilter !== "all" ? `Show: ${{"changed-only":"Changed and resolved","severity-increased":"Severity increased","remediation-changed":"Remediation changed","unresolved-errors":"Unresolved errors"}[comparisonFilter] || comparisonFilter}` : ""}{comparisonFilter !== "all" && (comparisonResourceQuery.trim() || comparisonSort !== "severity") ? " · " : ""}{comparisonResourceQuery.trim() ? `Search: “${comparisonResourceQuery.trim()}”` : ""}{comparisonResourceQuery.trim() && comparisonSort !== "severity" ? " · " : ""}{comparisonSort !== "severity" ? `Sort: ${{code:"Finding code",resource:"Resource"}[comparisonSort] || comparisonSort}` : ""}</span>
                    <button type="button" className="architecture-review-reset-filters" onClick={() => { setComparisonFilter("all"); setComparisonResourceQuery(""); setComparisonSort("severity"); }}>Clear comparison filters</button>
                  </div>
                )}
                <p className="architecture-review-filter-status" role="status" aria-live="polite" aria-atomic="true">
                  {comparisonVisibleGroups.reduce((count, group) => count + group.entries.length, 0)} comparison finding(s) shown.
                </p>
                {comparisonVisibleGroups.length === 0
                  ? (
                    <div className="architecture-review-comparison-empty">
                      <p>No findings match the current comparison filters.</p>
                      <p>Try a broader filter or clear the resource search.</p>
                      {(comparisonFilter !== "all" || comparisonResourceQuery.trim() || comparisonSort !== "severity") && (
                        <button type="button" className="architecture-review-reset-filters" onClick={() => {
                          setComparisonFilter("all");
                          setComparisonResourceQuery("");
                          setComparisonSort("severity");
                        }}>Reset comparison filters</button>
                      )}
                    </div>
                  )
                  : comparisonVisibleGroups.map(({ heading, key: groupKey, entries }) => (
                  <div className="architecture-review-comparison-group" key={groupKey}>
                    <strong>{heading} ({entries.length})</strong>
                    <ul>{entries.map((entry) => {
                      const finding = entry.finding || entry.previous;
                      const currentMatch = groupKey === "resolved"
                        ? null
                        : allDiagnostics.find((diagnostic) => diagnosticIdentity(diagnostic) === entry.identity);
                      const severity = finding?.severity || "unknown";
                      const hasCanvasTarget = Boolean(currentMatch && (currentMatch.resourceId || currentMatch.relationshipId || currentMatch.id));
                      return (
                        <li key={entry.identity} className={`architecture-review-comparison-item ${groupKey === "resolved" ? "is-resolved-comparison-item" : ""}`}>
                          <span className={`architecture-review-severity-badge severity-${String(severity).toLowerCase()}`}>{severity}</span>
                          <span className="architecture-review-comparison-item-copy">
                            <strong>{finding?.code || "Finding"}</strong>
                            <span>{finding?.message || "No message provided"}</span>
                            {entry.changes?.severity && <small>Severity: {entry.previous?.severity || "unknown"} → {entry.finding?.severity || "unknown"}</small>}
                            {entry.changes?.remediation && <small>Remediation changed: {entry.previous?.remediation || "None"} → {entry.finding?.remediation || "None"}</small>}
                            {groupKey === "resolved" && <small className="architecture-review-comparison-navigation-note">Resolved in the current snapshot; no current canvas target is available. Review the previous remediation below or in the exported comparison report.</small>}
                            {groupKey !== "resolved" && !hasCanvasTarget && <small className="architecture-review-comparison-navigation-note">No matching current canvas target was found. This snapshot entry may be stale or its finding may have changed.</small>}
                          </span>
                          {hasCanvasTarget && (
                            <button type="button" className="architecture-review-jump-button" onClick={() => onSelectDiagnostic?.(currentMatch)} title="Select this current finding on the canvas">Go to finding</button>
                          )}
                        </li>
                      );
                    })}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section id="architecture-remediation-checklist-panel" className="architecture-remediation-checklist" aria-label="Kubernetes remediation checklist">
            <div className="architecture-review-controls-heading">
              <div className="architecture-review-export-copy">
                <strong>Remediation checklist</strong>
                <span>{remediationSummary.completed} completed · {remediationSummary.pending} pending · {remediationSummary.errors} pending errors</span>
                <span>{remediationSummary.active} active findings · {remediationSummary.resolved} resolved findings · {remediationSummary.progressPercent}% complete</span>
                {remediationSummary.pendingResolved > 0 && <span>{remediationSummary.pendingResolved} pending task(s) belong to findings no longer present. Confirm the work before marking them complete.</span>}
              </div>
              <button type="button" className="architecture-review-export-button" onClick={refreshRemediationChecklist}>Refresh tasks from findings</button>
            </div>
            <div className="architecture-review-export-actions">
              <button type="button" className="architecture-review-export-button" onClick={() => downloadRemediationChecklist("markdown")}>Export checklist as Markdown</button>
              <button type="button" className="architecture-review-export-button" onClick={() => downloadRemediationChecklist("json")}>Export checklist as JSON</button>
            </div>
            <div className="architecture-remediation-checklist-filters">
              <label>
                Status
                <select value={remediationFilter} onChange={(event) => setRemediationFilter(event.target.value)}>
                  <option value="all">All tasks</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="errors">Pending errors only</option>
                  <option value="active">Active findings</option>
                  <option value="resolved">Resolved findings</option>
                </select>
              </label>
              <label>
                Search tasks
                <input type="search" value={remediationQuery} onChange={(event) => setRemediationQuery(event.target.value)} placeholder="Resource, code, message, remediation" />
              </label>
            </div>
            {(remediationFilter !== "all" || remediationQuery.trim()) && (
              <div className="architecture-review-active-filters" aria-label="Active remediation filters">
                <span><strong>Active filters:</strong> {remediationFilter !== "all" ? `Status: ${{pending:"Pending",completed:"Completed",errors:"Pending errors only",active:"Active findings",resolved:"Resolved findings"}[remediationFilter] || remediationFilter}` : ""}{remediationFilter !== "all" && remediationQuery.trim() ? " · " : ""}{remediationQuery.trim() ? `Search: “${remediationQuery.trim()}”` : ""}</span>
                <button type="button" className="architecture-review-reset-filters" onClick={() => { setRemediationFilter("all"); setRemediationQuery(""); }}>Clear task filters</button>
              </div>
            )}
            {remediationMessage && <p className="architecture-remediation-checklist-message" role="status">{remediationMessage}</p>}
            {visibleRemediationTasks.length === 0 ? (
              <div className="architecture-remediation-checklist-empty">
                {remediationTasks.length === 0 ? (
                  <>
                    <p>No checklist tasks yet.</p>
                    <p>Use “Refresh tasks from findings” to create tasks from current Kubernetes diagnostics.</p>
                  </>
                ) : (
                  <>
                    <p>No tasks match the current filters.</p>
                    <p>Try a different status or search term.</p>
                    {(remediationFilter !== "all" || remediationQuery.trim()) && (
                      <button type="button" className="architecture-review-reset-filters" onClick={() => {
                        setRemediationFilter("all");
                        setRemediationQuery("");
                      }}>Reset task filters</button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <ul className="architecture-remediation-task-list">
                {visibleRemediationTasks.map((task) => (
                  <li key={task.id} className={`architecture-remediation-task ${task.status === "completed" ? "is-completed" : ""} ${task.findingPresent === false ? "is-finding-resolved" : "is-finding-active"}`}>
                    <label className="architecture-remediation-task-check">
                      <input type="checkbox" checked={task.status === "completed"} onChange={() => toggleRemediationTask(task)} aria-label={`Mark remediation task ${task.code || "Finding"} ${task.status === "completed" ? "pending" : "completed"}`} />
                      <span>{task.status === "completed" ? "Completed" : "Pending"}</span>
                    </label>
                    <div className="architecture-remediation-task-copy">
                      <div className="architecture-remediation-task-title">
                        <span className={`architecture-review-severity-badge severity-${String(task.severity).toLowerCase()}`}>{task.severity}</span>
                        <strong>{task.code || "Finding"}</strong>
                        <span className={`architecture-remediation-finding-state ${task.findingPresent === false ? "is-resolved" : "is-active"}`}>{task.findingPresent === false ? "Finding resolved" : "Finding active"}</span>
                      </div>
                      <span>{task.message || "No message provided"}</span>
                      {task.resourceId && <small>Resource: {task.resourceId}</small>}
                      {task.remediation && <small>Action: {task.remediation}</small>}
                      {task.updatedAt && <small>Last status update: {new Date(task.updatedAt).toLocaleString()}</small>}
                    </div>
                    {task.status === "completed" && <icon name="check-circle-2" size="lg" color="success" />}
                  </li>
                ))}
              </ul>
            )}
            <p className="architecture-review-history-note">A finding disappearing after revalidation marks it resolved in the current diagram diagnostics, but does not automatically complete its task. Confirm remediation before checking it off. Checklist status is saved in this browser only and does not change the diagram or a live Kubernetes cluster.</p>
          </section>
          <section id="architecture-review-findings-panel" className="architecture-review-controls" aria-label="Filter deployment findings">
            <div className="architecture-review-controls-heading">
              <strong>Review findings</strong>
              <span>{reviewedCount} of {allDiagnostics.length} reviewed</span>
            </div>
            <div className="architecture-review-filter-row">
              <label>
                Status
                <select value={findingFilter} onChange={(event) => setFindingFilter(event.target.value)}>
                  <option value="all">All findings</option>
                  <option value="unreviewed">Not reviewed</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </label>
              <label>
                Resource
                <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}>
                  <option value="all">All resources</option>
                  {resourceOptions.map((resourceId) => <option key={resourceId} value={resourceId}>{resourceId}</option>)}
                </select>
              </label>
            </div>
            {(findingFilter !== "all" || resourceFilter !== "all") && (
              <div className="architecture-review-active-filters" aria-label="Active finding filters">
                <span><strong>Active filters:</strong> {findingFilter !== "all" ? `Status: ${findingFilter === "unreviewed" ? "Not reviewed" : "Reviewed"}` : ""}{findingFilter !== "all" && resourceFilter !== "all" ? " · " : ""}{resourceFilter !== "all" ? `Resource: ${resourceFilter}` : ""}</span>
                <button type="button" className="architecture-review-reset-filters" onClick={() => { setFindingFilter("all"); setResourceFilter("all"); }}>Clear finding filters</button>
              </div>
            )}
          </section>
          {visibleDiagnostics.length === 0 ? (
            <div className="architecture-validation-empty">No findings match these filters.</div>
          ) : (
            <>
              <DiagnosticGroup title="Errors" diagnostics={visibleErrors} {...sharedProps} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed} />
              <DiagnosticGroup title="Warnings" diagnostics={visibleWarnings} {...sharedProps} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed} />
              <DiagnosticGroup title="Info" diagnostics={visibleInfo} {...sharedProps} reviewedFindings={reviewedFindings} onToggleReviewed={toggleReviewed} />
            </>
          )}
          {resolvedFindings.length > 0 && (
            <section className="architecture-resolved-findings" aria-label="Resolved findings">
              <div className="architecture-validation-section-title">
                <span>Resolved since last review</span>
                <span className="architecture-validation-count">{resolvedFindings.length}</span>
              </div>
              <div className="architecture-validation-list">
                {resolvedFindings.slice().reverse().map((entry) => (
                  <article className="architecture-resolved-finding" key={entry.id}>
                    <div className="architecture-resolved-finding-status">Resolved — {entry.resolvedReason === "changed" ? "finding changed after revalidation" : "finding no longer present"}</div>
                    <div className="architecture-validation-diagnostic-message">{entry.diagnostic.message}</div>
                    <div className="architecture-validation-diagnostic-code">{entry.diagnostic.code}</div>
                    <button type="button" className="architecture-review-toggle" onClick={() => dismissResolved(entry.id)}>Dismiss</button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
