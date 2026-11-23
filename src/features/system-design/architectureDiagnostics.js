import { formatRps } from "./trafficSimulator.js";

export function deriveArchitectureDiagnostic(nodes = [], simulation = null, edges = []) {
  if (!simulation || !nodes.length) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const diagnostics = simulation.diagnostics || {};

  const rateLimit = diagnostics.rateLimitWarnings?.[0];
  if (rateLimit) return {
    tone: "danger",
    message: "⚠ " + (rateLimit.statusCode || 429) + " Too Many Requests: " + rateLimit.nodeLabel + " received " + formatRps(rateLimit.incomingRps) + "/s against a " + formatRps(rateLimit.capacityRps) + "/s limit — " + formatRps(rateLimit.rejectedRps) + " requests/s rejected. Add quota-aware backoff or reduce outbound demand.",
  };

  const stampede = diagnostics.cacheStampedes?.[0];
  if (stampede) {
    const backing = edges.filter((edge) => edge.from === stampede.nodeId)
      .map((edge) => byId.get(edge.to))
      .find((node) => node && (node.kind === "sql" || node.kind === "nosql"));
    const database = backing?.label || "Primary DB";
    const cacheName = stampede.nodeLabel || "Redis Cache";
    return {
      tone: "danger",
      message: `⚠ Cache Stampede: ${cacheName} is ${byId.get(stampede.nodeId)?.health === "down" ? "down" : "overloaded"} — 100% of traffic (${formatRps(stampede.incomingRps)}/s) hitting ${database}!`,
    };
  }

  const queueLag = diagnostics.queueLags?.[0];
  if (queueLag) {
    const consumers = queueLag.consumerNames?.join(", ") || "downstream consumers";
    return {
      tone: "warning",
      message: `⚠ Consumer Lag: ${consumers} is down/slow — messages accumulating in ${queueLag.nodeLabel || "the queue"}.`,
    };
  }

  const cycle = diagnostics.cycles?.[0];
  if (cycle) return { tone: "warning", message: `⚠ Circular dependency detected between ${cycle.labels.slice(0, -1).join(" and ")}.` };
  const depthWarning = diagnostics.depthWarnings?.[0];
  if (depthWarning) return { tone: "warning", message: `⚠ ${depthWarning.message}` };

  if (diagnostics.noHealthyUpstreams) {
    const group = simulation.healthChecks?.find((item) => item.allTargetsDown);
    return { tone: "danger", message: `503 No Healthy Upstreams: ${group?.nodeLabel || "Load Balancer"} has no healthy downstream targets.` };
  }

  const failover = (simulation.healthChecks || []).find((group) => group.downTargets > 0 && group.healthyTargets > 0);
  if (failover) {
    const survivors = failover.targetIds.map((id) => simulation.nodes[id]).filter(Boolean);
    const overloaded = survivors.find((metrics) => metrics.status === "overloaded");
    const elevated = survivors.find((metrics) => metrics.status === "elevated");
    const down = failover.downTargetIds.map((id) => byId.get(id)?.label).filter(Boolean);
    if (overloaded) return {
      tone: "danger",
      message: `⚠ Failover Overload: ${down.join(", ") || failover.poolLabel} replica is down — surviving replicas absorbing ${formatRps(failover.redistributedRpsPerTarget)}/s each.`,
    };
    if (elevated) return {
      tone: "warning",
      message: `Failover Pressure: ${down.join(", ") || failover.poolLabel} replica is down — surviving replicas are elevated but remain within capacity.`,
    };
    return {
      tone: "warning",
      message: `Health Check Failover: ${down.join(", ") || failover.poolLabel} replica is down — traffic stays within the ${failover.poolLabel} replica pool.`,
    };
  }

  const retry = diagnostics.retryEdges?.[0];
  if (retry) return {
    tone: "warning",
    message: `⚠ Retry Amplification: degraded dependency ${byId.get(retry.to)?.label || "downstream service"} adds 25% traffic (${formatRps(retry.amplifiedRps)}/s) to its calling edge.`,
  };

  const failed = nodes.find((node) => simulation.nodes[node.id]?.status === "down");
  if (failed) return { tone: "danger", message: `Single Point of Failure: ${failed.label} is down — restore it or add healthy replicas.` };

  const overloaded = nodes
    .map((node) => ({ node, metrics: simulation.nodes[node.id] }))
    .filter(({ metrics }) => metrics && metrics.status === "overloaded")
    .sort((a, b) => (b.metrics.utilization || 0) - (a.metrics.utilization || 0))[0];
  if (overloaded) {
    const { node, metrics } = overloaded;
    const fix = node.kind === "sql" || node.kind === "nosql" ? "Add read replicas, cache reads, or increase database capacity"
      : node.kind === "redis" ? "Increase cache replicas or capacity"
        : "increase replicas or capacity";
    return {
      tone: "danger",
      message: `Bottleneck: ${node.label} at ${Number.isFinite(metrics.utilization) ? Math.round(metrics.utilization * 100) : "∞"}% load (${formatRps(metrics.incomingRps)} / ${formatRps(nodeCapacityForDiagnostic(node))} RPS, p95: ${metrics.p95Ms ?? "—"}ms) — ${fix}.`,
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
  const p95 = Math.max(0, ...nodes.map((node) => simulation.nodes[node.id]?.p95Ms || 0));
  return { tone: "healthy", message: `System Healthy · End-to-End p95: ${Math.round(p95)}ms · Cache shielding ${shield}% of reads.` };
}

function nodeCapacityForDiagnostic(node) {
  return Math.max(0, Number(node.replicas) || 0) * Math.max(0, Number(node.capacityPerReplica) || 0);
}
