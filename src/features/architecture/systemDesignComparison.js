import { analyzeSystemDesignQuality } from "./systemDesignIntelligence.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const roleOf = (node) => String(node?.role || node?.type || node?.name || "").toLowerCase();
const round = (value) => Math.round(value * 10) / 10;

/** Normalize a diagram to the graph contract used by system-design analysis. */
export function normalizeSystemDesignGraph(graph = {}) {
  const safeGraph = graph && typeof graph === "object" ? graph : {};
  const nodes = asArray(safeGraph.nodes).filter((node) => node && node.id != null).map((node) => ({ ...node, id: String(node.id) }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = asArray(safeGraph.edges).filter((edge) => edge && edge.sourceId != null && edge.targetId != null).map((edge) => ({ ...edge, sourceId: String(edge.sourceId), targetId: String(edge.targetId) }));
  return { nodes, edges, danglingEdges: edges.filter((edge) => !ids.has(edge.sourceId) || !ids.has(edge.targetId)) };
}

/**
 * Transparent heuristic score (0-100), not an SLA or production-readiness claim.
 * The same deterministic weights are applied to both candidates.
 */
export function scoreSystemDesignArchitecture(graph = {}) {
  const normalized = normalizeSystemDesignGraph(graph);
  const review = analyzeSystemDesignQuality(normalized);
  const penalties = { error: 15, warning: 7, info: 2 };
  const deductions = review.diagnostics.reduce((sum, item) => sum + (penalties[item.severity] || 0), 0);
  const disconnected = review.diagnostics.filter((item) => item.code === "ISOLATED_COMPONENT").length;
  const dangling = normalized.danglingEdges.length;
  const componentCount = normalized.nodes.length;
  const connectionCount = normalized.edges.length;
  const score = Math.max(0, Math.min(100, 100 - deductions));
  const strengths = [];
  if (componentCount > 0 && disconnected === 0) strengths.push("Every component has at least one connection.");
  if (dangling === 0) strengths.push("All connection endpoints resolve to known components.");
  if (!review.diagnostics.some((item) => item.code === "SINGLE_REPLICA_CRITICAL_COMPONENT")) strengths.push("No explicitly identified critical component is configured with a single replica.");
  return {
    score,
    grade: score >= 90 ? "Strong" : score >= 75 ? "Promising" : score >= 55 ? "Needs review" : "High risk",
    metrics: { components: componentCount, connections: connectionCount, findings: review.diagnostics.length, errors: review.errors.length, warnings: review.warnings.length, info: review.info.length, disconnected, danglingConnections: dangling },
    strengths,
    findings: review.diagnostics,
    scoring: { method: "100 minus severity-weighted diagnostic deductions; error=15, warning=7, info=2; minimum 0", penalties },
  };
}

function compareCounts(label, a, b) {
  const delta = b - a;
  return { label, left: a, right: b, delta, interpretation: delta === 0 ? "Same count" : delta > 0 ? `${delta} more in Design B` : `${Math.abs(delta)} fewer in Design B` };
}

/** Compare two designs with the same transparent scoring rules. */
export function compareSystemDesignArchitectures(leftGraph = {}, rightGraph = {}) {
  const left = scoreSystemDesignArchitecture(leftGraph);
  const right = scoreSystemDesignArchitecture(rightGraph);
  const leftCodes = new Set(left.findings.map((item) => `${item.code}:${(item.nodeIds || []).slice().sort().join(",")}`));
  const rightCodes = new Set(right.findings.map((item) => `${item.code}:${(item.nodeIds || []).slice().sort().join(",")}`));
  const leftOnly = left.findings.filter((item) => !rightCodes.has(`${item.code}:${(item.nodeIds || []).slice().sort().join(",")}`));
  const rightOnly = right.findings.filter((item) => !leftCodes.has(`${item.code}:${(item.nodeIds || []).slice().sort().join(",")}`));
  const scoreDelta = round(right.score - left.score);
  return {
    left,
    right,
    winner: scoreDelta === 0 ? "tie" : scoreDelta > 0 ? "right" : "left",
    scoreDelta,
    metrics: [compareCounts("Components", left.metrics.components, right.metrics.components), compareCounts("Connections", left.metrics.connections, right.metrics.connections), compareCounts("Errors", left.metrics.errors, right.metrics.errors), compareCounts("Warnings", left.metrics.warnings, right.metrics.warnings), compareCounts("Findings", left.metrics.findings, right.metrics.findings)],
    leftOnlyFindings: leftOnly,
    rightOnlyFindings: rightOnly,
    caveat: "Heuristic comparison only. Scores reflect currently implemented structural checks, not measured latency, cost, throughput, availability, or a production-readiness guarantee. Component IDs should be stable and semantically comparable for meaningful finding diffs.",
  };
}
