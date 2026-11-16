/**
 * Studio-agnostic diagnostic presentation contract.
 * Validation rules remain owned by each studio. This module never mutates findings.
 */
const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });

function severityOf(value) {
  return Object.hasOwn(SEVERITY_ORDER, value) ? value : "info";
}

export function normalizeStudioDiagnostics(studio, findings = []) {
  if (studio !== "docker-compose" && studio !== "kubernetes") {
    throw new TypeError("Unsupported studio diagnostic source.");
  }
  if (!Array.isArray(findings)) throw new TypeError("Findings must be an array.");
  return findings.map((finding, index) => {
    const severity = severityOf(finding?.severity);
    const resource = studio === "kubernetes"
      ? [finding?.kind, finding?.resource].filter(Boolean).join("/")
      : (typeof finding?.path === "string" ? finding.path.split(".").slice(0, 2).join(".") : "");
    const code = typeof finding?.code === "string" && finding.code
      ? finding.code
      : (studio === "kubernetes" ? "K8S_RULE" : "COMPOSE_RULE");
    return {
      id: `${studio}:${finding?.id || `${code}:${index}`}`,
      studio,
      severity,
      code,
      message: String(finding?.message || "Unspecified diagnostic"),
      path: typeof finding?.path === "string" ? finding.path : "",
      resource,
      remediation: typeof finding?.remediation === "string" ? finding.remediation : "",
    };
  }).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.resource.localeCompare(b.resource)
    || a.code.localeCompare(b.code)
    || a.id.localeCompare(b.id));
}

export function summarizeStudioDiagnostics(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[severityOf(diagnostic.severity)] += 1;
  return { counts, valid: counts.error === 0 };
}
