const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });

function textValue(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function diagnosticIdentity(diagnostic) {
  return textValue(diagnostic?.diagnosticId || [
    diagnostic?.code || "",
    diagnostic?.resourceId || "",
    diagnostic?.relationshipId || "",
  ].join("|"), 500);
}

function safeDiagnostic(diagnostic, reviewedFindings) {
  const id = diagnosticIdentity(diagnostic);
  const fingerprint = JSON.stringify([
    diagnostic?.code || "", diagnostic?.severity || "", diagnostic?.message || "",
    diagnostic?.remediation || "", diagnostic?.resourceId || "", diagnostic?.relationshipId || "",
    diagnostic?.relationshipType || "", diagnostic?.sourceResourceId || "",
    diagnostic?.targetResourceId || "", diagnostic?.sourceResourceType || "",
    diagnostic?.targetResourceType || "",
  ]);
  const review = reviewedFindings instanceof Map ? reviewedFindings.get(id) : null;
  return {
    id,
    code: textValue(diagnostic?.code, 160),
    severity: ["error", "warning", "info"].includes(diagnostic?.severity) ? diagnostic.severity : "info",
    message: textValue(diagnostic?.message),
    remediation: textValue(diagnostic?.remediation),
    resourceId: textValue(diagnostic?.resourceId, 300) || null,
    relationshipId: textValue(diagnostic?.relationshipId, 300) || null,
    relationshipType: textValue(diagnostic?.relationshipType, 160) || null,
    source: {
      id: textValue(diagnostic?.sourceResourceId, 300) || null,
      type: textValue(diagnostic?.sourceResourceType, 160) || null,
    },
    target: {
      id: textValue(diagnostic?.targetResourceId, 300) || null,
      type: textValue(diagnostic?.targetResourceType, 160) || null,
    },
    reviewed: Boolean(review && review.fingerprint === fingerprint),
  };
}

function isKubernetesDiagnostic(item) {
  return item?.provider === "kubernetes" ||
    (typeof item?.code === "string" && item.code.startsWith("KUBERNETES_"));
}

/**
 * Creates a shareable report containing only Kubernetes diagnostics and
 * explicit resolved-history entries. Never serializes canvas elements or
 * arbitrary diagnostic metadata.
 */
export function buildKubernetesDeploymentReviewExport({
  validation,
  resolvedFindings = [],
  reviewedFindings = new Map(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const source = [
    ...(Array.isArray(validation?.errors) ? validation.errors : []),
    ...(Array.isArray(validation?.warnings) ? validation.warnings : []),
    ...(Array.isArray(validation?.info) ? validation.info : []),
  ].filter(isKubernetesDiagnostic);

  const seen = new Set();
  const findings = source.map((item) => safeDiagnostic(item, reviewedFindings))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || a.id.localeCompare(b.id));

  const resolved = (Array.isArray(resolvedFindings) ? resolvedFindings : []).map((entry) => {
    const diagnostic = safeDiagnostic(entry?.diagnostic || {}, new Map());
    return {
      id: textValue(entry?.id || diagnostic.id, 600),
      reason: entry?.resolvedReason === "changed" ? "changed" : "cleared",
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      remediation: diagnostic.remediation,
      resourceId: diagnostic.resourceId,
      relationshipId: diagnostic.relationshipId,
      relationshipType: diagnostic.relationshipType,
      source: diagnostic.source,
      target: diagnostic.target,
    };
  });

  const counts = {
    total: findings.length,
    errors: findings.filter((item) => item.severity === "error").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
    info: findings.filter((item) => item.severity === "info").length,
    reviewed: findings.filter((item) => item.reviewed).length,
    unreviewed: findings.filter((item) => !item.reviewed).length,
    resolved: resolved.length,
  };

  return {
    schemaVersion: 1,
    reportType: "sketchizi-kubernetes-deployment-review",
    generatedAt: textValue(generatedAt, 100),
    title: "Sketchizi Kubernetes Deployment Review",
    summary: counts,
    scopeNote: "Diagram-level review only. This report does not contact a Kubernetes cluster, validate live workloads, or guarantee runtime deployment readiness.",
    privacyNote: "This export includes Kubernetes finding details and resolution history only. It does not include the diagram, canvas elements, credentials, or unrelated provider findings.",
    findings,
    resolvedHistory: resolved,
  };
}

function markdownCell(value) {
  return textValue(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function renderKubernetesDeploymentReviewMarkdown(report) {
  const lines = [
    `# ${markdownCell(report?.title || "Sketchizi Kubernetes Deployment Review")}`,
    "",
    `Generated: ${markdownCell(report?.generatedAt || "Unknown")}`,
    "",
    "## Summary",
    "",
    `- Total current findings: ${Number(report?.summary?.total) || 0}`,
    `- Errors: ${Number(report?.summary?.errors) || 0}`,
    `- Warnings: ${Number(report?.summary?.warnings) || 0}`,
    `- Informational: ${Number(report?.summary?.info) || 0}`,
    `- Reviewed: ${Number(report?.summary?.reviewed) || 0}`,
    `- Not reviewed: ${Number(report?.summary?.unreviewed) || 0}`,
    `- Resolved/changed history: ${Number(report?.summary?.resolved) || 0}`,
    "",
    `> Scope: ${markdownCell(report?.scopeNote)}`,
    "",
    `> Privacy: ${markdownCell(report?.privacyNote)}`,
    "",
    "## Current findings",
    "",
  ];
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  if (!findings.length) lines.push("No Kubernetes findings were included in this report.", "");
  findings.forEach((finding, index) => {
    lines.push(`### ${index + 1}. [${markdownCell(String(finding.severity).toUpperCase())}] ${markdownCell(finding.code || "Finding")}`);
    lines.push("");
    lines.push(`- Review status: ${finding.reviewed ? "Reviewed" : "Not reviewed"}`);
    if (finding.resourceId) lines.push(`- Resource: ${markdownCell(finding.resourceId)}`);
    if (finding.relationshipId) lines.push(`- Relationship: ${markdownCell(finding.relationshipId)}`);
    if (finding.relationshipType) lines.push(`- Relationship type: ${markdownCell(finding.relationshipType)}`);
    if (finding.source?.id || finding.source?.type) lines.push(`- Source: ${markdownCell([finding.source?.type, finding.source?.id].filter(Boolean).join(" — "))}`);
    if (finding.target?.id || finding.target?.type) lines.push(`- Target: ${markdownCell([finding.target?.type, finding.target?.id].filter(Boolean).join(" — "))}`);
    lines.push("", markdownCell(finding.message) || "No message provided.", "");
    if (finding.remediation) lines.push(`**Remediation:** ${markdownCell(finding.remediation)}`, "");
  });
  lines.push("## Resolution history", "");
  const resolved = Array.isArray(report?.resolvedHistory) ? report.resolvedHistory : [];
  if (!resolved.length) lines.push("No resolved or changed findings recorded in this review session.", "");
  resolved.forEach((entry, index) => {
    lines.push(`### ${index + 1}. [${entry.reason === "changed" ? "Changed" : "No longer present"}] ${markdownCell(entry.code || "Finding")}`);
    lines.push("");
    lines.push(`- Previous severity: ${markdownCell(entry.severity)}`);
    if (entry.resourceId) lines.push(`- Resource: ${markdownCell(entry.resourceId)}`);
    lines.push("", markdownCell(entry.message) || "No message provided.", "");
    if (entry.remediation) lines.push(`**Previous remediation:** ${markdownCell(entry.remediation)}`, "");
  });
  return `${lines.join("\n").trim()}\n`;
}
