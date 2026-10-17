const SEVERITY_RANK = Object.freeze({ error: 0, warning: 1, info: 2 });

function safeText(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function normalizeFinding(item) {
  return {
    code: safeText(item?.code, 160),
    severity: ["error", "warning", "info"].includes(item?.severity) ? item.severity : "info",
    message: safeText(item?.message),
    remediation: safeText(item?.remediation),
    resourceId: safeText(item?.resourceId, 300),
    reviewed: Boolean(item?.reviewed),
  };
}

// A compact deterministic reference that does not expose source IDs or resource names.
function stableFindingReference(finding) {
  const identity = [
    finding.code.trim().toUpperCase(),
    finding.severity,
    finding.resourceId.trim().toLowerCase(),
    finding.message.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `K8S-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function addFindingReferences(findings) {
  const seen = new Map();
  return findings.map((finding) => {
    const base = stableFindingReference(finding);
    const occurrence = (seen.get(base) || 0) + 1;
    seen.set(base, occurrence);
    return { ...finding, findingRef: occurrence === 1 ? base : `${base}-${occurrence}` };
  });
}

function getPriority(finding) {
  if (finding.severity === "error") {
    return { priority: "High", priorityGroup: "high", reason: "Error-level finding requires attention" };
  }
  if (finding.severity === "warning") {
    return { priority: "Medium", priorityGroup: "medium", reason: "Warning-level finding has not been reviewed" };
  }
  return { priority: "Review", priorityGroup: "review", reason: "Informational finding has not been reviewed" };
}

export function buildKubernetesExecutiveReviewReport({
  reviewReport = {},
  readiness = {},
  comparison = null,
  remediationTasks = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const findings = addFindingReferences((Array.isArray(reviewReport.findings) ? reviewReport.findings : [])
    .map(normalizeFinding)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      || a.code.localeCompare(b.code)
      || a.resourceId.localeCompare(b.resourceId)
      || a.message.localeCompare(b.message)));
  const tasks = (Array.isArray(remediationTasks) ? remediationTasks : []).filter((task) => task && typeof task.id === "string").map((task) => ({
    code: safeText(task.code, 160),
    severity: ["error", "warning", "info"].includes(task.severity) ? task.severity : "info",
    resourceId: safeText(task.resourceId, 300),
    message: safeText(task.message),
    remediation: safeText(task.remediation),
    status: task.status === "completed" ? "completed" : "pending",
    findingStatus: task.findingPresent === false ? "resolved-in-current-validation" : "present-in-current-validation",
  }));
  const counts = {
    findings: findings.length,
    errors: findings.filter((item) => item.severity === "error").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
    info: findings.filter((item) => item.severity === "info").length,
    reviewed: findings.filter((item) => item.reviewed).length,
    unreviewed: findings.filter((item) => !item.reviewed).length,
    remediationTasks: tasks.length,
    remediationPending: tasks.filter((item) => item.status === "pending").length,
    remediationCompleted: tasks.filter((item) => item.status === "completed").length,
    pendingErrors: tasks.filter((item) => item.status === "pending" && item.severity === "error").length,
    pendingResolvedFindings: tasks.filter((item) => item.status === "pending" && item.findingStatus === "resolved-in-current-validation").length,
  };
  counts.reviewCoveragePercent = counts.findings ? Math.round((counts.reviewed / counts.findings) * 100) : 100;
  counts.remediationCompletionPercent = counts.remediationTasks ? Math.round((counts.remediationCompleted / counts.remediationTasks) * 100) : 0;
  const comparisonSummary = comparison ? {
    added: Array.isArray(comparison.added) ? comparison.added.length : 0,
    changed: Array.isArray(comparison.changed) ? comparison.changed.length : 0,
    resolved: Array.isArray(comparison.resolved) ? comparison.resolved.length : 0,
    unchanged: Array.isArray(comparison.unchanged) ? comparison.unchanged.length : 0,
  } : null;
  const priorities = findings
    .filter((item) => item.severity === "error" || !item.reviewed)
    .map((item) => ({ ...item, ...getPriority(item) }));
  const priorityGroups = {
    high: priorities.filter((item) => item.priorityGroup === "high"),
    medium: priorities.filter((item) => item.priorityGroup === "medium"),
    review: priorities.filter((item) => item.priorityGroup === "review"),
  };
  const status = readiness.status || "unknown";
  return {
    reportType: "sketchizi-kubernetes-executive-review",
    reportVersion: "1.13.6",
    schemaVersion: 2,
    metadata: {
      generatedAt: safeText(generatedAt, 100),
      reportVersion: "1.13.6",
      schemaVersion: 2,
      findingReferenceScheme: "K8S-FNV1A32-v1",
      scope: "sanitized-diagram-validation",
    },
    generatedAt: safeText(generatedAt, 100),
    title: "Sketchizi Kubernetes Executive Review",
    readiness: {
      status: safeText(status, 80),
      title: safeText(readiness.title || "Kubernetes Deployment Readiness", 160),
      summary: safeText(readiness.summary, 1000),
      scopeNote: safeText(readiness.scopeNote || reviewReport.scopeNote, 1000),
    },
    summary: { ...counts, priorityHigh: priorityGroups.high.length, priorityMedium: priorityGroups.medium.length, priorityReview: priorityGroups.review.length },
    comparison: comparisonSummary,
    priorities,
    priorityGroups,
    findings,
    remediationTasks: tasks,
    scopeNote: "Diagram-level assessment only. No live Kubernetes API, workload status, rollout state, cluster configuration, or runtime behavior was inspected. This report is not deployment certification.",
    privacyNote: "Contains sanitized Kubernetes findings, manually tracked review status, and remediation task fields only. It excludes the diagram, canvas elements, credentials, and arbitrary metadata.",
  };
}

export function renderKubernetesExecutiveReviewMarkdown(report = {}) {
  const clean = (value) => safeText(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const summary = report.summary || {};
  const metadata = report.metadata || {};
  const lines = [
    `# ${clean(report.title || "Sketchizi Kubernetes Executive Review")}`, "",
    `- Report version: ${clean(metadata.reportVersion || report.reportVersion || "Unknown")}`,
    `- Schema version: ${Number(metadata.schemaVersion || report.schemaVersion) || 1}`,
    `- Reference scheme: ${clean(metadata.findingReferenceScheme || "Unknown")}`,
    `Generated: ${clean(metadata.generatedAt || report.generatedAt || "Unknown")}`, "",
    "## Executive summary", "",
    `- Readiness assessment: ${clean(report.readiness?.title || "Unknown")} (${clean(report.readiness?.status || "unknown")})`,
    `- Current findings: ${Number(summary.findings) || 0} (${Number(summary.errors) || 0} errors, ${Number(summary.warnings) || 0} warnings, ${Number(summary.info) || 0} informational)`,
    `- Review coverage: ${Number(summary.reviewCoveragePercent) || 0}% (${Number(summary.reviewed) || 0} reviewed, ${Number(summary.unreviewed) || 0} unreviewed)`,
    `- Remediation checklist: ${Number(summary.remediationCompletionPercent) || 0}% complete (${Number(summary.remediationCompleted) || 0} completed, ${Number(summary.remediationPending) || 0} pending)`,
    `- Pending error tasks: ${Number(summary.pendingErrors) || 0}`,
    `- Pending tasks attached to resolved findings: ${Number(summary.pendingResolvedFindings) || 0}`,
    "",
    clean(report.readiness?.summary), "",
    `> Scope: ${clean(report.scopeNote)}`, "",
    `> Privacy: ${clean(report.privacyNote)}`, "",
    "## Priority actions", "",
  ];
  const priorities = Array.isArray(report.priorities) ? report.priorities : [];
  if (!priorities.length) lines.push("No error-level or unreviewed findings require prioritization from the included diagram diagnostics.", "");
  const groupLabels = [
    ["high", "High priority — errors"],
    ["medium", "Medium priority — unreviewed warnings"],
    ["review", "Review recommended — unreviewed informational findings"],
  ];
  const groups = report.priorityGroups || {};
  for (const [key, label] of groupLabels) {
    const items = Array.isArray(groups[key]) ? groups[key] : priorities.filter((item) => item.priorityGroup === key);
    if (!items.length) continue;
    lines.push(`### ${label}`, "");
    items.forEach((item) => {
      lines.push(`#### ${clean(item.findingRef || "K8S-UNASSIGNED")} · ${clean(item.code || "Finding")} (${clean(item.severity)})`, "");
      lines.push(`- Priority: ${clean(item.priority)}`);
      lines.push(`- Reason: ${clean(item.reason)}`);
      if (item.resourceId) lines.push(`- Resource: ${clean(item.resourceId)}`);
      lines.push("", clean(item.message) || "No message provided.", "");
      if (item.remediation) lines.push(`**Suggested remediation:** ${clean(item.remediation)}`, "");
    });
  }
  lines.push("## Snapshot comparison", "");
  if (report.comparison) {
    lines.push(`- New: ${Number(report.comparison.added) || 0}`);
    lines.push(`- Changed: ${Number(report.comparison.changed) || 0}`);
    lines.push(`- Resolved: ${Number(report.comparison.resolved) || 0}`);
    lines.push(`- Unchanged: ${Number(report.comparison.unchanged) || 0}`, "");
  } else {
    lines.push("No snapshot comparison was active when this report was generated.", "");
  }
  lines.push("## Remediation checklist", "");
  const tasks = Array.isArray(report.remediationTasks) ? report.remediationTasks : [];
  if (!tasks.length) lines.push("No remediation tasks have been saved in the checklist.", "");
  tasks.forEach((task) => {
    lines.push(`- [${task.status === "completed" ? "x" : " "}] **${clean(task.code || "Finding")}** — ${clean(task.status)}; ${task.findingStatus === "resolved-in-current-validation" ? "finding absent from current diagnostics" : "finding present in current diagnostics"}`);
    if (task.resourceId) lines.push(`  - Resource: ${clean(task.resourceId)}`);
    if (task.remediation) lines.push(`  - Action: ${clean(task.remediation)}`);
  });
  return `${lines.join("\n").trim()}\n`;
}
