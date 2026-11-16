const SEVERITY_RANK = Object.freeze({ error: 0, warning: 1, info: 2 });
const SEVERITY_LABEL = Object.freeze({
  error: "Action required",
  warning: "Review recommended",
  info: "Optional improvement",
});

function isKubernetesDiagnostic(diagnostic) {
  return diagnostic?.provider === "kubernetes" ||
    (typeof diagnostic?.code === "string" && diagnostic.code.startsWith("KUBERNETES_"));
}

/**
 * Combine existing Kubernetes validation findings into a prioritized,
 * read-only deployment-readiness report. This is a diagram review, not a
 * Kubernetes API/server-side readiness check.
 */
export function buildKubernetesDeploymentReadinessReport(validation) {
  const diagnostics = [
    ...(Array.isArray(validation?.errors) ? validation.errors : []),
    ...(Array.isArray(validation?.warnings) ? validation.warnings : []),
    ...(Array.isArray(validation?.info) ? validation.info : []),
  ].filter(isKubernetesDiagnostic);

  const seen = new Set();
  const findings = diagnostics.filter((diagnostic) => {
    const identity = diagnostic.diagnosticId ||
      [diagnostic.code || "", diagnostic.resourceId || "", diagnostic.relationshipId || ""].join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map((diagnostic, index) => ({
    ...diagnostic,
    priority: SEVERITY_RANK[diagnostic.severity] ?? 3,
    priorityLabel: SEVERITY_LABEL[diagnostic.severity] || "Review",
    _stableIndex: index,
  })).sort((a, b) => a.priority - b.priority || a._stableIndex - b._stableIndex)
    .map(({ _stableIndex, ...diagnostic }) => diagnostic);

  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const info = findings.filter((item) => item.severity === "info").length;
  const status = errors > 0 ? "action-required" : warnings > 0 ? "review-recommended" : findings.length > 0 ? "optional-improvements" : "no-findings";

  return {
    provider: "kubernetes",
    title: "Kubernetes Deployment Readiness",
    status,
    summary: findings.length === 0
      ? "No Kubernetes findings were returned by the current diagram checks."
      : `${errors} action-required, ${warnings} review-recommended, ${info} optional finding${findings.length === 1 ? "" : "s"}.`,
    counts: { total: findings.length, errors, warnings, info },
    findings,
    isReadOnly: true,
    scopeNote: "This report reviews the diagram model only. It does not contact a Kubernetes cluster or guarantee runtime deployment readiness.",
  };
}
