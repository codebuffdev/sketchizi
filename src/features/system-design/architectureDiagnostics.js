import { formatRps } from "./trafficSimulator.js";

export function deriveArchitectureDiagnostic(nodes = [], simulation = null, edges = []) {
  if (!simulation || !nodes.length) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (simulation.diagnostics?.noHealthyUpstreams) {
    const group = simulation.healthChecks?.find((item) => item.allTargetsDown);
    return { tone: "danger", message: `503 No Healthy Upstreams: ${group?.nodeLabel || "Load Balancer"} has no healthy downstream targets.` };
  }
  const failover = (simulation.healthChecks || []).find((group) => group.downTargets > 0 && group.healthyTargets > 0);
  if (failover) {
    const overloadedSurvivor = failover.targetIds
      .map((id) => ({ node: byId.get(id), metrics: simulation.nodes[id] }))
      .find(({ metrics }) => metrics && ["elevated", "overloaded"].includes(metrics.status));
    if (overloadedSurvivor) {
      const downNames = failover.downTargetIds.map((id) => byId.get(id)?.label).filter(Boolean);
      return {
        tone: "danger",
        message: `⚠ Failover Overload: ${downNames.join(", ") || "A downstream service"} is down — remaining services absorbing ${formatRps(failover.redistributedRpsPerTarget)}/s each.`,
      };
    }
    const down = failover.downTargetIds.map((id) => byId.get(id)?.label).filter(Boolean);
    return { tone: "warning", message: `Health Check Failover: ${down.join(", ") || "A downstream service"} is down — redistributed ${formatRps(failover.redistributedRpsPerTarget)}/s across ${failover.healthyTargets} healthy targets.` };
  }
  const failed = nodes.find((node) => simulation.nodes[node.id]?.status === "down");
  if (failed) return { tone: "danger", message: `Single Point of Failure: ${failed.label} is down — restore it or add healthy replicas.` };
  const overloaded = nodes
    .map((node) => ({ node, metrics: simulation.nodes[node.id] }))
    .filter(({ metrics }) => metrics && (metrics.status === "overloaded" || metrics.status === "down"))
    .sort((a, b) => (b.metrics.utilization || 0) - (a.metrics.utilization || 0))[0];
  if (overloaded) {
    const { node, metrics } = overloaded;
    const fix = node.kind === "sql" ? "Add Redis Cache or increase database replicas"
      : node.kind === "redis" ? "Increase cache replicas or capacity"
        : "increase replicas or capacity, or add a cache upstream";
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
  const cacheNodes = nodes.filter((node) => node.kind === "redis" || node.kind === "cdn" || node.cache);
  const hit = cacheNodes.reduce((sum, node) => sum + (simulation.nodes[node.id]?.shieldedRps || 0), 0);
  const incoming = cacheNodes.reduce((sum, node) => sum + (simulation.nodes[node.id]?.incomingRps || 0), 0);
  const shield = incoming ? Math.round((hit / incoming) * 100) : 0;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const memo = new Map();
  const visiting = new Set();
  const pathLatency = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const own = simulation.nodes[id]?.p95Ms || 0;
    const downstream = Math.max(0, ...(outgoing.get(id) || []).map(pathLatency));
    visiting.delete(id);
    memo.set(id, own + downstream);
    return memo.get(id);
  };
  const roots = nodes.filter((node) => indegree.get(node.id) === 0);
  const p95 = Math.max(0, ...roots.map((node) => pathLatency(node.id)), ...nodes.map((node) => pathLatency(node.id)));
  return { tone: "healthy", message: `System Healthy · End-to-End p95: ${Math.round(p95)}ms · Cache shielding ${shield}% of reads.` };
}
