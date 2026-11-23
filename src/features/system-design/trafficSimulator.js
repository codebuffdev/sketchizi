// Deterministic distributed-systems traffic model. Pure: graph + load -> telemetry.
import { getPrimitive } from "./primitives.js";

export const LOAD_PRESETS = Object.freeze([1000, 10000, 50000]);
export const HEALTHY_MAX = 0.75;
export const MAX_HOPS = 12;
export const INGRESS_KINDS = Object.freeze(new Set(["client", "cdn", "dns", "api-gateway", "load-balancer"]));

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const normalizedLabel = (node) => String(node?.label || node?.kind || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function nodeCapacity(node) {
  const primitive = getPrimitive(node.kind);
  const defaultCapacity = primitive?.capacityPerReplica ?? (node.kind === "sql" || node.kind === "nosql" ? 4000 : 6000);
  return Math.max(0, Number(node.replicas ?? primitive?.replicas ?? 1) || 0)
    * Math.max(0, Number(node.capacityPerReplica ?? defaultCapacity) || 0);
}

export function deriveStatus(utilization, health = "healthy") {
  if (health === "down") return "down";
  if (utilization > 1) return "overloaded";
  if (health === "degraded" || utilization >= HEALTHY_MAX) return "elevated";
  return "healthy";
}

/** Queueing-style p95. Utilization adds queueing delay to the configured service baseline. */
export function computeP95(baseLatencyMs, utilization, health = "healthy") {
  if (health === "down") return null;
  const base = Math.max(0.5, Number(baseLatencyMs) || 1);
  const rho = Math.max(0, utilization);
  const multiplier = rho <= 1
    ? 1 + (rho * rho) / Math.max(0.05, 1 - Math.min(rho, 0.95)) * 0.6
    : 1 + 0.95 * 0.95 / 0.05 * 0.6 + (rho - 1) * 60;
  return round(base * (health === "degraded" ? 1.8 : 1) * multiplier, 1);
}

function buildAcyclicGraph(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const valid = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  const color = new Map();
  const stack = [];
  const skipped = new Set();
  const cycles = [];
  const depthWarnings = [];
  const visit = (id, depth) => {
    color.set(id, 1);
    stack.push(id);
    for (const edge of valid.filter((item) => item.from === id)) {
      const targetColor = color.get(edge.to) || 0;
      if (targetColor === 1) {
        const start = stack.indexOf(edge.to);
        const path = [...stack.slice(start), edge.to];
        skipped.add(edge.id);
        cycles.push({ edgeId: edge.id, nodeIds: path, labels: path.map((nodeId) => byId.get(nodeId)?.label || nodeId) });
      } else if (targetColor === 0 && depth >= MAX_HOPS) {
        skipped.add(edge.id);
        depthWarnings.push({ edgeId: edge.id, from: id, to: edge.to, maxHops: MAX_HOPS });
      } else if (targetColor === 0) visit(edge.to, depth + 1);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const node of nodes) if (!color.has(node.id)) visit(node.id, 0);
  const activeEdges = valid.filter((edge) => !skipped.has(edge.id));
  for (const edge of activeEdges) outgoing.get(edge.from).push(edge);
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of activeEdges) indegree.set(edge.to, indegree.get(edge.to) + 1);
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const edge of outgoing.get(id)) {
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  // DFS pruning makes this a DAG; this fallback is defensive against malformed duplicate IDs.
  for (const node of nodes) if (!order.includes(node.id)) order.push(node.id);
  return { byId, valid, outgoing, order, cycles, depthWarnings, skipped };
}

export function simulateTraffic({ nodes = [], edges = [], totalRps = 0 } = {}) {
  const graph = buildAcyclicGraph(nodes, edges);
  const { byId, valid, outgoing, order, cycles, depthWarnings, skipped } = graph;
  const isEntry = (node) => node.entry ?? getPrimitive(node.kind)?.entry ?? false;
  const isCache = (node) => node.cache ?? getPrimitive(node.kind)?.cache ?? false;
  const isQueue = (node) => node.kind === "queue";
  const isBalancer = (node) => node.kind === "load-balancer" || node.kind === "api-gateway";
  const isIngress = (node) => isEntry(node) || INGRESS_KINDS.has(node.kind);
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of valid.filter((item) => !skipped.has(item.id))) indegree.set(edge.to, indegree.get(edge.to) + 1);
  const roots = nodes.filter((node) => indegree.get(node.id) === 0);
  const entryRoots = roots.filter(isEntry);
  const selectedRoots = entryRoots.length ? entryRoots : roots.filter(isIngress).length ? roots.filter(isIngress) : roots.length ? roots : nodes.slice(0, 1);
  const entryIds = new Set(selectedRoots.map((node) => node.id));
  const entryShare = (Number(totalRps) || 0) / Math.max(1, entryIds.size);

  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const edgeRps = new Map();
  const edgeMeta = new Map();
  const metrics = new Map();
  const cacheStampedes = [];
  const queueLags = [];
  const retryEdges = [];
  const healthChecks = [];
  const effectiveIncoming = new Map();

  for (const id of order) {
    const node = byId.get(id);
    const arriving = round((incoming.get(id) || 0) + (entryIds.has(id) ? entryShare : 0), 1);
    const capacity = nodeCapacity(node);
    const down = node.health === "down";
    const utilization = down ? 0 : capacity > 0 ? arriving / capacity : arriving > 0 ? Infinity : 0;
    const initialStatus = deriveStatus(utilization, node.health);
    const cache = isCache(node);
    const queueNode = isQueue(node);
    const cacheUnavailable = cache && (down || initialStatus === "overloaded");
    const hitRate = cacheUnavailable ? 0 : cache ? clamp01(node.cacheHitRate ?? getPrimitive(node.kind)?.cacheHitRate ?? 0) : 0;
    if (cacheUnavailable && arriving > 0) {
      cacheStampedes.push({ nodeId: id, nodeLabel: node.label || (node.kind === "redis" ? "Redis Cache" : "CDN"), incomingRps: arriving, hitRate: 0 });
    }

    const served = down ? 0 : queueNode ? arriving : Math.min(arriving, capacity);
    const forwardable = down ? 0 : cache ? arriving * (1 - hitRate) : served;
    const branches = outgoing.get(id) || [];
    const outgoingShares = new Map();
    let queueLag = null;

    if (queueNode) {
      const consumers = branches.map((edge) => ({ edge, node: byId.get(edge.to) }));
      const available = consumers.filter(({ node: target }) => target.health !== "down");
      const capacityTotal = available.reduce((sum, { node: target }) => sum + nodeCapacity(target), 0);
      const slow = available.some(({ node: target }) => target.health === "degraded" || arriving > nodeCapacity(target));
      const lagging = consumers.length > 0 && (available.length !== consumers.length || capacityTotal < arriving || slow);
      if (lagging) {
        const failed = consumers.filter(({ node: target }) => target.health === "down").map(({ node: target }) => target.label || target.kind);
        const slowNames = available.filter(({ node: target }) => target.health === "degraded" || arriving > nodeCapacity(target)).map(({ node: target }) => target.label || target.kind);
        queueLag = { nodeId: id, nodeLabel: node.label || "Message Queue / Kafka", incomingRps: arriving, consumerNames: [...failed, ...slowNames], consumerDown: failed.length > 0 };
        queueLags.push(queueLag);
      }
      const each = available.length ? arriving / available.length : 0;
      for (const edge of branches) {
        const target = byId.get(edge.to);
        const targetAvailable = target.health !== "down";
        const consumerShare = targetAvailable ? Math.min(each, nodeCapacity(target)) : 0;
        outgoingShares.set(edge.id, consumerShare);
        edgeMeta.set(edge.id, targetAvailable ? {} : { consumerDown: true, bufferedRps: arriving / Math.max(1, branches.length) });
      }
    } else if (isBalancer(node)) {
      // Different normalized labels are independent domain routes. Identical labels form an HA replica pool.
      const pools = new Map();
      for (const edge of branches) {
        const key = normalizedLabel(byId.get(edge.to));
        if (!pools.has(key)) pools.set(key, []);
        pools.get(key).push(edge);
      }
      const routeShare = pools.size ? forwardable / pools.size : 0;
      for (const [poolLabel, poolEdges] of pools) {
        const healthy = poolEdges.filter((edge) => byId.get(edge.to).health !== "down");
        const replicaShare = healthy.length ? routeShare / healthy.length : 0;
        for (const edge of poolEdges) {
          const targetDown = byId.get(edge.to).health === "down";
          outgoingShares.set(edge.id, targetDown ? 0 : replicaShare);
          if (targetDown) edgeMeta.set(edge.id, {
            serviceUnavailable: poolEdges.length === 1,
            replicaFailed: poolEdges.length > 1,
            inactiveReason: poolEdges.length === 1 ? "503 Dropped" : "Replica Health Check Failed",
          });
        }
        if (poolEdges.length > 1 || healthy.length !== poolEdges.length) {
          healthChecks.push({ nodeId: id, nodeLabel: node.label || "Load Balancer", poolLabel, incomingRps: round(routeShare, 1), healthyTargets: healthy.length, downTargets: poolEdges.length - healthy.length, allTargetsDown: healthy.length === 0, targetIds: healthy.map((edge) => edge.to), downTargetIds: poolEdges.filter((edge) => byId.get(edge.to).health === "down").map((edge) => edge.to), redistributedRpsPerTarget: round(replicaShare, 1) });
        }
      }
    } else {
      const share = branches.length ? forwardable / branches.length : 0;
      for (const edge of branches) outgoingShares.set(edge.id, share);
    }

    for (const edge of branches) {
      const target = byId.get(edge.to);
      let rps = outgoingShares.get(edge.id) || 0;
      const retryEligible = !cache && !queueNode && !isCache(target) && !isQueue(target) && target.health === "degraded";
      if (retryEligible && rps > 0) {
        rps *= 1.25;
        retryEdges.push({ edgeId: edge.id, from: id, to: target.id, baseRps: round(rps / 1.25, 1), amplifiedRps: round(rps, 1), factor: 1.25 });
        edgeMeta.set(edge.id, { ...(edgeMeta.get(edge.id) || {}), retryAmplification: 1.25, retryLabel: "Retries · +25%" });
      }
      edgeRps.set(edge.id, round(rps, 1));
      if (rps > 0) incoming.set(edge.to, incoming.get(edge.to) + rps);
    }
    const status = queueLag ? "lagging" : initialStatus;
    const baseLatency = node.baseLatencyMs ?? getPrimitive(node.kind)?.baseLatencyMs ?? ((node.kind === "sql" || node.kind === "nosql") ? 20 : 25);
    const serviceP95Ms = computeP95(baseLatency, Number.isFinite(utilization) ? utilization : 10, node.health);
    metrics.set(id, {
      id, incomingRps: arriving, servedRps: round(served, 1),
      droppedRps: round(Math.max(0, arriving - (queueNode ? arriving : served)), 1),
      forwardedRps: round(queueNode ? arriving : forwardable, 1),
      shieldedRps: round(cache && !cacheUnavailable ? arriving * hitRate : 0, 1),
      cacheHitRate: hitRate, utilization: Number.isFinite(utilization) ? round(utilization, 4) : Infinity,
      serviceP95Ms, p95Ms: serviceP95Ms, status, ...(queueLag ? { lag: queueLag } : {}),
    });
    effectiveIncoming.set(id, arriving);
  }

  // Propagate synchronous downstream p95 back to each caller. Queues and caches terminate this latency chain.
  for (const id of [...order].reverse()) {
    const node = byId.get(id);
    const current = metrics.get(id);
    if (!current || current.status === "down" || isQueue(node) || isCache(node)) continue;
    const children = (outgoing.get(id) || []).filter((edge) => !isCache(byId.get(edge.to)) && !isQueue(byId.get(edge.to)));
    const downstream = Math.max(0, ...children.map((edge) => metrics.get(edge.to)?.p95Ms || 0));
    current.p95Ms = round((current.serviceP95Ms || 0) + downstream, 1);
  }

  const edgesResult = Object.fromEntries(valid.map((edge) => {
    const source = byId.get(edge.from);
    return [edge.id, {
      rps: round(edgeRps.get(edge.id) || 0, 1), protocol: edge.protocol,
      cacheHitRate: isCache(source) ? (metrics.get(source.id)?.cacheHitRate || 0) : 0,
      ...(edgeMeta.get(edge.id) || {}),
      ...(skipped.has(edge.id) ? { cycleBlocked: true, inactiveReason: "Circular dependency" } : {}),
    }];
  }));
  const noHealthyUpstreams = healthChecks.some((group) => group.allTargetsDown);
  const cycleWarnings = cycles.map((cycle) => ({ ...cycle, message: `Circular dependency detected between ${cycle.labels.join(" and ")}.` }));
  const depthWarningsFormatted = depthWarnings.map((warning) => ({ ...warning, message: `Traversal stopped at the ${MAX_HOPS}-hop safety limit.` }));
  return {
    nodes: Object.fromEntries(metrics),
    edges: edgesResult,
    healthChecks,
    diagnostics: {
      noHealthyUpstreams,
      failovers: healthChecks.filter((group) => group.downTargets > 0 && group.healthyTargets > 0),
      cacheStampedes, queueLags, retryEdges, cycles: cycleWarnings, depthWarnings: depthWarningsFormatted,
    },
    totalRps: Number(totalRps) || 0,
  };
}

export function formatRps(value) {
  const n = Number(value) || 0;
  if (n >= 10000) return `${round(n / 1000, 0)}k`;
  if (n >= 1000) return `${round(n / 1000, 1)}k`;
  return String(Math.round(n));
}

export function packetCountForRps(rps) {
  if (!(rps > 0)) return 0;
  return Math.min(6, Math.max(1, Math.round(Math.log10(rps + 1))));
}
