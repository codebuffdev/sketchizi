// Deterministic traffic propagation. Pure: nodes + edges + load in, telemetry out.
//
// nodes: [{ id, kind, replicas, capacityPerReplica, cacheHitRate, health, entry?, cache? , baseLatencyMs? }]
// edges: [{ id, from, to, protocol }]

import { getPrimitive } from "./primitives.js";

export const LOAD_PRESETS = Object.freeze([1000, 10000, 50000]);
export const HEALTHY_MAX = 0.75;
/** Kinds that originate traffic when nothing upstream feeds them (in addition to primitives flagged `entry`). */
export const INGRESS_KINDS = Object.freeze(new Set(["client", "cdn", "dns", "api-gateway", "load-balancer"]));

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function nodeCapacity(node) {
  return Math.max(0, Number(node.replicas) || 0) * Math.max(0, Number(node.capacityPerReplica) || 0);
}

export function deriveStatus(utilization, health = "healthy") {
  if (health === "down") return "down";
  if (utilization > 1) return "overloaded";
  if (health === "degraded" || utilization >= HEALTHY_MAX) return "elevated";
  return "healthy";
}

/** Queueing-style p95: flat until ~50% utilisation, then climbs sharply and saturates when overloaded. */
export function computeP95(baseLatencyMs, utilization, health = "healthy") {
  if (health === "down") return null;
  const base = Math.max(0.5, Number(baseLatencyMs) || 1);
  const rho = Math.max(0, utilization);
  let multiplier;
  if (rho <= 1) multiplier = 1 + (rho * rho) / Math.max(0.05, 1 - Math.min(rho, 0.95)) * 0.6;
  else multiplier = 1 + 0.95 * 0.95 / 0.05 * 0.6 + (rho - 1) * 60; // saturated: queue grows
  if (health === "degraded") multiplier *= 1.8;
  return round(base * 1.7 * multiplier, 1);
}

function entryRps(node, totalRps, entryIds) {
  return entryIds.has(node.id) ? totalRps / entryIds.size : 0;
}

/**
 * Walks the graph in topological order (Kahn). Cycles are tolerated: nodes left
 * after the pass are processed once with whatever traffic has reached them, so
 * the result stays deterministic and finite.
 */
export function simulateTraffic({ nodes = [], edges = [], totalRps = 0 } = {}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to);
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of validEdges) {
    outgoing.get(edge.from).push(edge);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const isEntry = (node) => node.entry ?? getPrimitive(node.kind)?.entry ?? false;
  const isCache = (node) => node.cache ?? getPrimitive(node.kind)?.cache ?? false;
  const isIngress = (node) => isEntry(node) || INGRESS_KINDS.has(node.kind);
  // Traffic sources, most specific first, so a freshly dropped `Load Balancer -> Service` never sits at RPS 0:
  //   1. Client / CDN / DNS roots (nothing feeds them),  2. API Gateway / Load Balancer roots,
  //   3. any other node with no incoming edge,           4. (cycles only) flagged entries, then the first node.
  const roots = nodes.filter((node) => indegree.get(node.id) === 0);
  const entryIds = new Set(
    [
      roots.filter(isEntry),
      roots.filter(isIngress),
      roots,
      nodes.filter(isEntry),
      nodes.slice(0, 1),
    ].find((tier) => tier.length)?.map((node) => node.id) || [],
  );

  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const edgeRps = new Map();
  const edgeHealth = new Map();
  const result = new Map();
  const healthCheckGroups = [];
  const remaining = new Map(indegree);
  const queue = nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
  const done = new Set();

  const process = (id) => {
    if (done.has(id)) return;
    done.add(id);
    const node = byId.get(id);
    const arriving = incoming.get(id) + entryRps(node, Number(totalRps) || 0, entryIds);
    const capacity = nodeCapacity(node);
    const down = node.health === "down";
    const utilization = down ? 0 : capacity > 0 ? arriving / capacity : (arriving > 0 ? Infinity : 0);
    const status = deriveStatus(utilization, node.health);
    const served = down ? 0 : Math.min(arriving, capacity > 0 ? capacity : 0);
    const hit = isCache(node) ? clamp01(node.cacheHitRate) : 0;
    // Cache shield: only misses continue downstream. Overloaded nodes shed excess.
    const forwardable = down ? 0 : (isCache(node) ? served * (1 - hit) : served);
    const branches = outgoing.get(id);
    const healthChecking = node.kind === "load-balancer" || node.kind === "api-gateway";
    const eligible = healthChecking ? branches.filter((edge) => byId.get(edge.to)?.health !== "down") : branches;
    const share = eligible.length ? forwardable / eligible.length : 0;
    if (healthChecking && branches.length) {
      healthCheckGroups.push({
        nodeId: id,
        nodeLabel: node.label || (node.kind === "load-balancer" ? "Load Balancer" : "API Gateway"),
        incomingRps: round(arriving, 1),
        healthyTargets: eligible.length,
        downTargets: branches.length - eligible.length,
        allTargetsDown: eligible.length === 0,
        redistributedRpsPerTarget: round(share, 1),
        targetIds: eligible.map((edge) => edge.to),
      });
    }
    for (const edge of branches) {
      const targetDown = byId.get(edge.to)?.health === "down";
      const failedHealthCheck = healthChecking && targetDown;
      const edgeShare = failedHealthCheck ? 0 : share;
      edgeRps.set(edge.id, edgeShare);
      if (edgeShare > 0) incoming.set(edge.to, incoming.get(edge.to) + edgeShare);
      if (failedHealthCheck) {
        // The UI can render a visible inactive health-check link without animating packets.
        edgeHealth.set(edge.id, { healthCheckFailed: true, inactiveReason: "Health Check Failed" });
      }
    }
    result.set(id, {
      id,
      incomingRps: round(arriving, 1),
      servedRps: round(served, 1),
      droppedRps: round(Math.max(0, arriving - served), 1),
      forwardedRps: round(forwardable, 1),
      shieldedRps: round(isCache(node) && !down ? served * hit : 0, 1),
      utilization: Number.isFinite(utilization) ? round(utilization, 4) : Infinity,
      p95Ms: computeP95(node.baseLatencyMs ?? getPrimitive(node.kind)?.baseLatencyMs, Number.isFinite(utilization) ? utilization : 10, node.health),
      status,
    });
    for (const edge of branches) {
      remaining.set(edge.to, remaining.get(edge.to) - 1);
      if (remaining.get(edge.to) === 0) queue.push(edge.to);
    }
  };

  while (queue.length) process(queue.shift());
  for (const node of nodes) process(node.id); // cycle leftovers, stable order

  const edgesResult = Object.fromEntries(validEdges.map((edge) => {
    const source = byId.get(edge.from);
    return [edge.id, {
      rps: round(edgeRps.get(edge.id) || 0, 1),
      protocol: edge.protocol,
      cacheHitRate: isCache(source) ? clamp01(source.cacheHitRate) : 0,
      ...(edgeHealth.get(edge.id) || {}),
    }];
  }));
  return {
    nodes: Object.fromEntries(result),
    edges: edgesResult,
    healthChecks: healthCheckGroups,
    diagnostics: {
      noHealthyUpstreams: healthCheckGroups.some((group) => group.allTargetsDown),
      failovers: healthCheckGroups.filter((group) => group.downTargets > 0 && group.healthyTargets > 0),
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

/** Packet count for the animated connector, scaled (log) by live edge RPS. 0 = idle edge. */
export function packetCountForRps(rps) {
  if (!(rps > 0)) return 0;
  return Math.min(6, Math.max(1, Math.round(Math.log10(rps + 1))));
}
