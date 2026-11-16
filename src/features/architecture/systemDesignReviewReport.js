import { buildDecisionRecordExport } from "./systemDesignDecisionRecords.js";

export function buildSystemDesignReviewReport({ title = "System Design Review", graph = { nodes: [], edges: [] }, comparison = null, diagnostics = [], decisionRecords = [], generatedAt = new Date().toISOString() } = {}) {
  const safeGraph = { nodes: Array.isArray(graph?.nodes) ? graph.nodes : [], edges: Array.isArray(graph?.edges) ? graph.edges : [] };
  const findings = (Array.isArray(diagnostics) ? diagnostics : []).map((item) => ({ severity: String(item?.severity || "info"), code: String(item?.code || "UNKNOWN"), title: String(item?.title || item?.message || "Finding"), message: String(item?.message || ""), remediation: String(item?.remediation || ""), resourceId: item?.resourceId == null ? null : String(item.resourceId) }));
  return {
    schemaVersion: 1,
    title: String(title || "System Design Review").slice(0, 160),
    generatedAt,
    architecture: { componentCount: safeGraph.nodes.length, connectionCount: safeGraph.edges.length, components: safeGraph.nodes, connections: safeGraph.edges },
    findings: { total: findings.length, errors: findings.filter((item) => item.severity === "error").length, warnings: findings.filter((item) => item.severity === "warning").length, items: findings },
    comparison: comparison ? { scoreDelta: comparison.scoreDelta ?? null, winner: comparison.winner ?? null, metrics: Array.isArray(comparison.metrics) ? comparison.metrics : [], visualDiff: comparison.visualDiff || null, caveat: comparison.caveat || "Scores are heuristic and do not establish production readiness." } : null,
    decisionRecords: buildDecisionRecordExport(decisionRecords),
    limitations: ["Structural findings are advisory and depend on available diagram metadata.", "Scores are heuristic; runtime performance, cost, and availability are not measured.", "The report does not certify production readiness or deploy infrastructure."]
  };
}

const md = (value) => String(value ?? "").replace(/[\r\n]+/g, " ");
export function renderSystemDesignReviewReportMarkdown(report) {
  const r = report || {};
  const lines = [`# ${md(r.title || "System Design Review")}`, "", `Generated: ${md(r.generatedAt || "unknown")}`, "", "## Architecture overview", "", `- Components: ${r.architecture?.componentCount ?? 0}`, `- Connections: ${r.architecture?.connectionCount ?? 0}`, "", "## Findings", "", `- Total: ${r.findings?.total ?? 0}`, `- Errors: ${r.findings?.errors ?? 0}`, `- Warnings: ${r.findings?.warnings ?? 0}`, ""];
  for (const f of r.findings?.items || []) lines.push(`### [${md(f.severity).toUpperCase()}] ${md(f.title)}`, "", md(f.message), ...(f.remediation ? ["", `Recommendation: ${md(f.remediation)}`] : []), "");
  lines.push("## Architecture decisions", "");
  const records = r.decisionRecords?.records || [];
  if (!records.length) lines.push("No architecture decision records were included.", "");
  for (const d of records) lines.push(`### ${md(d.title)} (${md(d.status)})`, "", `- Context: ${md(d.context) || "Not provided"}`, `- Decision: ${md(d.decision) || "Not provided"}`, `- Consequences: ${md(d.consequences) || "Not provided"}`, `- Alternatives: ${md(d.alternatives) || "Not provided"}`, "");
  if (r.comparison) lines.push("## Comparison", "", `- Winner by heuristic score: ${md(r.comparison.winner || "not determined")}`, `- Score difference: ${r.comparison.scoreDelta ?? "not available"}`, "", md(r.comparison.caveat), "");
  lines.push("## Limitations", "", ...(r.limitations || []).map((item) => `- ${md(item)}`), "");
  return lines.join("\n");
}
