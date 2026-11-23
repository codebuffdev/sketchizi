import { formatRps } from "./trafficSimulator.js";

export function deriveArchitectureDiagnostic(nodes = [], simulation = null) {
  if (!simulation || !nodes.length) return null;
  const overloaded = nodes
    .map((node) => ({ node, metrics: simulation.nodes[node.id] }))
    .filter(({ metrics }) => metrics && (metrics.status === "overloaded" || metrics.status === "down"))
    .sort((a, b) => (b.metrics.utilization || 0) - (a.metrics.utilization || 0))[0];
  if (overloaded) {
    const { node, metrics } = overloaded;
    const fix = node.kind === "sql" ? "Add Redis Cache or increase database replicas"
      : node.kind === "redis" ? "Increase cache replicas or capacity"
        : "Increase replicas or capacity, or add a cache upstream";
    return {
      tone: "danger",
      message: `Bottleneck: ${node.label} at ${Number.isFinite(metrics.utilization) ? Math.round(metrics.utilization * 100) : "∞"}% load (${formatRps(metrics.incomingRps)} / ${formatRps((Number(node.replicas) || 0) * (Number(node.capacityPerReplica) || 0))} RPS, p95: ${metrics.p95Ms ?? "—"}ms) — ${fix}.`,
    };
  }
  const singlePoint = nodes
    .map((node) => ({ node, metrics: simulation.nodes[node.id] }))
    .filter(({ node, metrics }) => metrics?.incomingRps > 0 && Number(node.replicas) <= 1 && node.kind !== "client")
    .sort((a, b) => b.metrics.incomingRps - a.metrics.incomingRps)[0];
  if (singlePoint) return { tone: "warning", message: `Single Point of Failure: ${singlePoint.node.label} has ${singlePoint.node.replicas} replica under ${formatRps(singlePoint.metrics.incomingRps)}/s load — add a replica.` };
  const caches = nodes.map((node) => simulation.nodes[node.id]).filter(Boolean);
  const hit = caches.reduce((sum, item) => sum + item.shieldedRps, 0);
  const incoming = caches.reduce((sum, item) => sum + item.incomingRps, 0);
  const shield = incoming ? Math.round((hit / incoming) * 100) : 0;
  const p95 = Math.max(0, ...nodes.map((node) => simulation.nodes[node.id]?.p95Ms || 0));
  return { tone: "healthy", message: `System Healthy · End-to-End p95: ${Math.round(p95)}ms · Cache shielding ${shield}% of reads.` };
}
