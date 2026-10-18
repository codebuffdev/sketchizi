/**
 * Sketchizi-owned deterministic discrete-event simulation engine, v0.1.
 *
 * This engine intentionally supports a narrow, auditable synchronous request path.
 * It is not a Breakscale engine clone and does not import Breakscale code. Unsupported
 * features are blocked rather than approximated silently.
 */
export const SIMULATION_ENGINE_VERSION = "0.1.0";
export const SIMULATION_RESULT_SCHEMA_VERSION = 1;
const SUPPORTED_NODE_KINDS = new Set(["traffic-source", "request-service", "relational-store", "external-service-approximation"]);
const SERVICE_NODE_KINDS = new Set(["request-service", "relational-store", "external-service-approximation"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const makeDiagnostic = (code, severity, title, message, extras = {}) => ({ code, severity, title, message, ...extras });

function hash(value) {
  const text = JSON.stringify(canonicalize(value));
  let out = 2166136261;
  for (let i = 0; i < text.length; i += 1) { out ^= text.charCodeAt(i); out = Math.imul(out, 16777619); }
  return `fnv1a32:${(out >>> 0).toString(16).padStart(8, "0")}`;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

// Mulberry32 is used only for repeatable simulation streams, not cryptography.
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function sampleServiceMs(mean, cv, random) {
  if (cv === 0) return mean;
  // Convert mean and coefficient of variation to log-normal mu/sigma.
  const sigmaSquared = Math.log(1 + cv * cv);
  const sigma = Math.sqrt(sigmaSquared);
  const mu = Math.log(mean) - sigmaSquared / 2;
  const u1 = Math.max(Number.MIN_VALUE, random());
  const u2 = random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * normal);
}
function summarize(values) {
  if (!values.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const at = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: values.length,
    mean: round(total / values.length),
    p50: round(at(0.50)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1]),
  };
}
const round = (value) => value === null || value === undefined ? null : Number(value.toFixed(4));

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items; a.push(item); let i = a.length - 1;
    while (i > 0) { const p = Math.floor((i - 1) / 2); if (compareEvent(a[p], item) <= 0) break; a[i] = a[p]; i = p; }
    a[i] = item;
  }
  pop() {
    const a = this.items; if (!a.length) return null;
    const first = a[0]; const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1; const right = left + 1;
        if (left >= a.length) break;
        let child = left;
        if (right < a.length && compareEvent(a[right], a[left]) < 0) child = right;
        if (compareEvent(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}
function compareEvent(a, b) { return a.timeMs - b.timeMs || a.sequence - b.sequence; }

function blocked(diagnostics, provenance = {}) {
  return { status: "blocked", result: null, diagnostics, provenance };
}

/**
 * Run the first supported simulation slice.
 *
 * scenarioOverrides is intentionally small and explicit:
 * - trafficMultiplier: multiply all configured traffic source rates
 * - failureProbabilityByNodeId: override operation-failure probability by SimIR node ID or source entity ID
 * - unavailableNodeIds: simulate a hard outage for processing nodes (node IDs or source entity IDs)
 * - seed: override the seed for controlled experiment comparison
 *
 * Non-zero timeouts and retries are blocked until cancellation/retry semantics are modeled.
 */
export function runSimulation({ projection, scenarioOverrides = {}, limits = {} } = {}) {
  const diagnostics = [];
  if (!isRecord(projection) || projection.status !== "ready" || !isRecord(projection.topology)) {
    return blocked([makeDiagnostic("ENGINE-PROJECTION-NOT-READY", "blocker", "Simulation projection is not ready", "Compile a valid Workbench model and simulation profile before running the engine.")]);
  }
  const topology = projection.topology;
  if (topology.schemaVersion !== 1 || topology.semantics !== "sketchizi-runtime-ir" || !Array.isArray(topology.nodes) || !Array.isArray(topology.edges)) {
    return blocked([makeDiagnostic("ENGINE-SIMIR-UNSUPPORTED", "blocker", "Unsupported simulation model", "This engine version accepts Sketchizi runtime IR schema version 1 only.")]);
  }
  if (!isRecord(scenarioOverrides)) return blocked([makeDiagnostic("ENGINE-OVERRIDES-INVALID", "blocker", "Invalid experiment overrides", "Experiment overrides must be an object.")]);
  const multiplier = scenarioOverrides.trafficMultiplier === undefined ? 1 : scenarioOverrides.trafficMultiplier;
  const seed = scenarioOverrides.seed === undefined ? topology.scenario?.seed : scenarioOverrides.seed;
  const durationMs = topology.scenario?.durationMs;
  const safeLimits = isRecord(limits) ? limits : {};
  const maxRequests = Number.isSafeInteger(safeLimits.maxRequests) && safeLimits.maxRequests > 0 ? safeLimits.maxRequests : 250000;
  if (!finite(multiplier) || multiplier <= 0) diagnostics.push(makeDiagnostic("ENGINE-TRAFFIC-MULTIPLIER-INVALID", "blocker", "Invalid traffic multiplier", "trafficMultiplier must be a finite number greater than zero."));
  if (!Number.isSafeInteger(seed)) diagnostics.push(makeDiagnostic("ENGINE-SEED-INVALID", "blocker", "Invalid random seed", "The scenario seed must be a safe integer."));
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) diagnostics.push(makeDiagnostic("ENGINE-DURATION-INVALID", "blocker", "Invalid simulation duration", "The projection must contain a positive integer durationMs."));
  if (Object.keys(scenarioOverrides).some((key) => !["trafficMultiplier", "failureProbabilityByNodeId", "unavailableNodeIds", "seed"].includes(key))) {
    diagnostics.push(makeDiagnostic("ENGINE-OVERRIDE-UNKNOWN", "blocker", "Unknown experiment override", "Only trafficMultiplier, failureProbabilityByNodeId, unavailableNodeIds, and seed are supported by engine v0.1."));
  }
  const nodes = topology.nodes.slice().sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
  const edges = topology.edges.slice().sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
  const malformedNodes = nodes.filter((node) => !isRecord(node) || typeof node.id !== "string" || !node.id);
  if (malformedNodes.length) return blocked([makeDiagnostic("ENGINE-NODE-ID-INVALID", "blocker", "Invalid runtime node", "Every runtime node must be an object with a non-empty string id.")], { engineVersion: SIMULATION_ENGINE_VERSION });
  const nodeById = new Map();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || !node.id) {
      diagnostics.push(makeDiagnostic("ENGINE-NODE-ID-INVALID", "blocker", "Invalid runtime node", "Every runtime node must have a non-empty id.")); continue;
    }
    if (nodeById.has(node.id)) diagnostics.push(makeDiagnostic("ENGINE-NODE-ID-DUPLICATE", "blocker", "Duplicate runtime node", `Runtime node '${node.id}' is duplicated.`));
    nodeById.set(node.id, node);
    if (!SUPPORTED_NODE_KINDS.has(node.kind)) diagnostics.push(makeDiagnostic("ENGINE-NODE-KIND-UNSUPPORTED", "blocker", "Runtime node kind not supported", `Node '${node.id}' uses '${node.kind}', which is not supported by engine v0.1.`, { nodeIds: [node.id] }));
    if (node.kind === "request-service" || node.kind === "external-service-approximation" || node.kind === "relational-store") {
      const p = node.parameters || {};
      if (!Number.isSafeInteger(p.concurrency) || p.concurrency < 1 || !finite(p.meanServiceMs) || p.meanServiceMs <= 0 || !finite(p.serviceTimeCv) || p.serviceTimeCv < 0 || !Number.isSafeInteger(p.bufferCapacity) || p.bufferCapacity < 0 || !finite(p.failureProbability) || p.failureProbability < 0 || p.failureProbability > 1) {
        diagnostics.push(makeDiagnostic("ENGINE-NODE-PARAMETERS-INVALID", "blocker", "Invalid processing profile", `Node '${node.id}' has invalid concurrency, service time, variability, queue capacity, or failure probability.`, { nodeIds: [node.id] }));
      }
      if (p.retryAttempts !== undefined && p.retryAttempts !== 0) diagnostics.push(makeDiagnostic("ENGINE-RETRY-UNSUPPORTED", "blocker", "Retries are not supported yet", `Node '${node.id}' has retryAttempts > 0. Engine v0.1 does not model retry/cancellation semantics.` , { nodeIds: [node.id] }));
      if (p.timeoutMs !== undefined && p.timeoutMs !== 0) diagnostics.push(makeDiagnostic("ENGINE-TIMEOUT-UNSUPPORTED", "blocker", "Timeouts are not supported yet", `Node '${node.id}' has timeoutMs > 0. Engine v0.1 does not model timeout/cancellation semantics.`, { nodeIds: [node.id] }));
    }
    if (node.kind === "relational-store") {
      const p = node.parameters || {};
      if (!finite(p.readFraction) || p.readFraction < 0 || p.readFraction > 1 || !finite(p.writeContentionMs) || p.writeContentionMs < 0) diagnostics.push(makeDiagnostic("ENGINE-DATABASE-PROFILE-INVALID", "blocker", "Invalid database profile", `Node '${node.id}' has invalid readFraction or writeContentionMs.`, { nodeIds: [node.id] }));
    }
    if (node.kind === "traffic-source" && (!finite(node.parameters?.trafficRps) || node.parameters.trafficRps <= 0)) diagnostics.push(makeDiagnostic("ENGINE-TRAFFIC-SOURCE-INVALID", "blocker", "Invalid traffic source", `Node '${node.id}' must have positive trafficRps.`, { nodeIds: [node.id] }));
  }
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const edgeById = new Map();
  const edgeCounts = new Map();
  for (const edge of edges) {
    if (!isRecord(edge) || typeof edge.id !== "string" || !edge.id) { diagnostics.push(makeDiagnostic("ENGINE-EDGE-ID-INVALID", "blocker", "Invalid runtime edge", "Every edge must have a non-empty id.")); continue; }
    if (edgeById.has(edge.id)) diagnostics.push(makeDiagnostic("ENGINE-EDGE-ID-DUPLICATE", "blocker", "Duplicate runtime edge", `Runtime edge '${edge.id}' is duplicated.`));
    edgeById.set(edge.id, edge);
    if (edge.kind !== "request") { diagnostics.push(makeDiagnostic("ENGINE-EDGE-KIND-UNSUPPORTED", "blocker", "Runtime edge kind not supported", `Edge '${edge.id}' has kind '${edge.kind}'. Engine v0.1 supports synchronous request edges only.`, { edgeIds: [edge.id] })); continue; }
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) { diagnostics.push(makeDiagnostic("ENGINE-EDGE-ENDPOINT-MISSING", "blocker", "Runtime edge endpoint missing", `Edge '${edge.id}' references a missing runtime node.`, { edgeIds: [edge.id] })); continue; }
    outgoing.get(edge.sourceId).push(edge); incoming.get(edge.targetId).push(edge); edgeCounts.set(edge.id, 0);
  }
  for (const node of nodes) {
    const outs = outgoing.get(node.id) || [];
    if (node.kind === "traffic-source" && outs.length !== 1) diagnostics.push(makeDiagnostic("ENGINE-TRAFFIC-ROUTE-INVALID", "blocker", "Traffic source must have one route", `Traffic source '${node.label || node.id}' must have exactly one outgoing request edge. Ordinary Excalidraw arrows are visual only; create a Workbench Calls relationship from this React application to a REST service or API endpoint in the component Inspector.`, { nodeIds: [node.id] }));
    if (node.kind !== "traffic-source" && outs.length > 1) diagnostics.push(makeDiagnostic("ENGINE-ROUTING-UNSUPPORTED", "blocker", "Multi-target routing is not supported yet", `Node '${node.id}' has ${outs.length} outgoing request edges. Engine v0.1 supports one successor per request path.`, { nodeIds: [node.id], edgeIds: outs.map((edge) => edge.id) }));
    if (node.kind === "traffic-source" && incoming.get(node.id).length > 0) diagnostics.push(makeDiagnostic("ENGINE-TRAFFIC-INCOMING-INVALID", "blocker", "Traffic source cannot receive requests", `Traffic source '${node.id}' has incoming request edges.`, { nodeIds: [node.id] }));
  }
  const failureOverrides = Object.hasOwn(scenarioOverrides, "failureProbabilityByNodeId") ? scenarioOverrides.failureProbabilityByNodeId : {};
  if (!isRecord(failureOverrides)) diagnostics.push(makeDiagnostic("ENGINE-FAILURE-OVERRIDES-INVALID", "blocker", "Invalid failure overrides", "failureProbabilityByNodeId must be an object."));
  else for (const [key, probability] of Object.entries(failureOverrides)) {
    const node = nodeById.get(key) || nodes.find((item) => item.sourceEntityId === key);
    if (!node) diagnostics.push(makeDiagnostic("ENGINE-FAILURE-OVERRIDE-NODE-MISSING", "blocker", "Unknown failure target", `No runtime node matches failure override '${key}'.`));
    else if (!SERVICE_NODE_KINDS.has(node.kind) || !finite(probability) || probability < 0 || probability > 1) diagnostics.push(makeDiagnostic("ENGINE-FAILURE-OVERRIDE-INVALID", "blocker", "Invalid failure override", `Failure override '${key}' must target a processing node and be between 0 and 1.`, { nodeIds: [node.id] }));
  }
  const unavailableInput = Object.hasOwn(scenarioOverrides, "unavailableNodeIds") ? scenarioOverrides.unavailableNodeIds : [];
  const unavailableNodeIdSet = new Set();
  if (!Array.isArray(unavailableInput) || unavailableInput.some((item) => typeof item !== "string" || !item.trim())) {
    diagnostics.push(makeDiagnostic("ENGINE-UNAVAILABLE-NODES-INVALID", "blocker", "Invalid unavailable-node list", "unavailableNodeIds must be an array of non-empty runtime node IDs or source entity IDs."));
  } else for (const key of unavailableInput) {
    const node = nodeById.get(key) || nodes.find((item) => item.sourceEntityId === key);
    if (!node) diagnostics.push(makeDiagnostic("ENGINE-UNAVAILABLE-NODE-MISSING", "blocker", "Unknown unavailable node", `No runtime node matches unavailable node '${key}'.`));
    else if (!SERVICE_NODE_KINDS.has(node.kind)) diagnostics.push(makeDiagnostic("ENGINE-UNAVAILABLE-NODE-INVALID", "blocker", "Invalid unavailable node", `Only processing nodes can be marked unavailable; '${key}' is '${node.kind}'.`, { nodeIds: [node.id] }));
    else unavailableNodeIdSet.add(node.id);
  }
  const sources = nodes.filter((node) => node.kind === "traffic-source");
  if (!sources.length) diagnostics.push(makeDiagnostic("ENGINE-TRAFFIC-SOURCE-MISSING", "blocker", "Traffic source required", "At least one traffic-source node is required."));
  // Block synchronous cycles and runtime nodes unreachable from traffic sources.
  const reachable = new Set();
  const visit = (id) => { if (reachable.has(id)) return; reachable.add(id); for (const edge of outgoing.get(id) || []) visit(edge.targetId); };
  for (const source of sources) visit(source.id);
  for (const node of nodes) if (!reachable.has(node.id)) diagnostics.push(makeDiagnostic("ENGINE-NODE-UNREACHABLE", "blocker", "Runtime node is unreachable", `Node '${node.id}' is not reachable from a configured traffic source.`, { nodeIds: [node.id] }));
  const color = new Map();
  const checkCycle = (id, path = []) => {
    if (color.get(id) === 1) { diagnostics.push(makeDiagnostic("ENGINE-CYCLE-UNSUPPORTED", "blocker", "Synchronous cycle is not supported", `Cycle encountered at '${id}': ${[...path, id].join(" → ")}.`, { nodeIds: [...path, id] })); return; }
    if (color.get(id) === 2) return;
    color.set(id, 1); for (const edge of outgoing.get(id) || []) checkCycle(edge.targetId, [...path, id]); color.set(id, 2);
  };
  for (const source of sources) checkCycle(source.id);
  const blockers = diagnostics.some((item) => item.severity === "blocker");
  if (blockers) return blocked(diagnostics.sort((a, b) => a.code.localeCompare(b.code)), { engineVersion: SIMULATION_ENGINE_VERSION, sourceModelFingerprint: projection.provenance?.sourceModelFingerprint ?? null });

  const expectedRequests = sources.reduce((sum, source) => sum + source.parameters.trafficRps * multiplier * durationMs / 1000, 0);
  if (expectedRequests > maxRequests) return blocked([makeDiagnostic("ENGINE-REQUEST-LIMIT-EXCEEDED", "blocker", "Scenario exceeds request safety limit", `Expected traffic is about ${Math.round(expectedRequests)} requests; limit is ${maxRequests}. Reduce duration or traffic, or explicitly raise limits.maxRequests.`)], { engineVersion: SIMULATION_ENGINE_VERSION });

  const random = createRandom(seed);
  let sequence = 0; let requestSequence = 0;
  const events = new MinHeap();
  const schedule = (event) => events.push({ ...event, sequence: sequence++ });
  const nodeStats = new Map(nodes.filter((node) => SERVICE_NODE_KINDS.has(node.kind)).map((node) => [node.id, {
    arrivals: 0, started: 0, completed: 0, failures: 0, dropped: 0, busyObservedMs: 0,
    queueWaits: [], serviceTimes: [], active: 0, waiting: [],
  }]));
  const terminal = { successful: 0, successfulWithinWindow: 0, failed: 0, dropped: 0, allLatencies: [], successfulLatencies: [] };
  const enqueueRoute = (nodeId, request, timeMs, incomingEdgeId = null) => {
    const node = nodeById.get(nodeId);
    const stats = nodeStats.get(nodeId);
    if (!node || !stats) {
      diagnostics.push(makeDiagnostic("ENGINE-INTERNAL-ROUTE-ERROR", "blocker", "Internal simulation route error", `Unable to dispatch request to '${nodeId}'.`));
      return;
    }
    stats.arrivals += 1;
    if (unavailableNodeIdSet.has(nodeId)) {
      stats.failures += 1;
      finishRequest(request, "failed", timeMs);
      return;
    }
    const queued = { request, queuedAt: timeMs, incomingEdgeId };
    if (stats.active < node.parameters.concurrency) startService(nodeId, queued, timeMs);
    else if (stats.waiting.length < node.parameters.bufferCapacity) stats.waiting.push(queued);
    else { stats.dropped += 1; finishRequest(request, "dropped", timeMs); }
  };
  const startService = (nodeId, queued, timeMs) => {
    const node = nodeById.get(nodeId); const stats = nodeStats.get(nodeId); const p = node.parameters;
    stats.active += 1; stats.started += 1; stats.queueWaits.push(timeMs - queued.queuedAt);
    let extraMs = 0;
    if (node.kind === "relational-store") {
      const edge = queued.incomingEdgeId ? edgeById.get(queued.incomingEdgeId) : null;
      const reads = edge?.parameters?.reads === true; const writes = edge?.parameters?.writes === true;
      let isWrite = writes && !reads;
      if (reads && writes) isWrite = random() >= p.readFraction;
      if (isWrite) extraMs = p.writeContentionMs;
    }
    const serviceMs = sampleServiceMs(p.meanServiceMs ?? p.processingTimeMs, p.serviceTimeCv ?? 0, random) + extraMs;
    stats.serviceTimes.push(serviceMs);
    const endMs = timeMs + serviceMs;
    stats.busyObservedMs += Math.max(0, Math.min(endMs, durationMs) - Math.min(timeMs, durationMs));
    schedule({ type: "service-complete", timeMs: endMs, nodeId, queued, serviceMs });
  };
  function finishRequest(request, outcome, timeMs) {
    const latency = Math.max(0, timeMs - request.arrivalMs);
    terminal.allLatencies.push(latency);
    if (outcome === "success") {
      terminal.successful += 1;
      terminal.successfulLatencies.push(latency);
      if (timeMs <= durationMs) terminal.successfulWithinWindow += 1;
    }
    else if (outcome === "dropped") terminal.dropped += 1;
    else terminal.failed += 1;
  }

  // Pre-generate a deterministic Poisson arrival stream for each traffic source.
  let totalOffered = 0;
  for (const source of sources) {
    const rps = source.parameters.trafficRps * multiplier;
    let arrivalMs = 0;
    while (true) {
      const u = Math.max(Number.MIN_VALUE, random());
      arrivalMs += -Math.log(u) * 1000 / rps;
      if (arrivalMs >= durationMs) break;
      totalOffered += 1;
      if (totalOffered > maxRequests) return blocked([makeDiagnostic("ENGINE-REQUEST-LIMIT-EXCEEDED", "blocker", "Scenario exceeds request safety limit", `Generated more than ${maxRequests} requests. Reduce traffic or duration.`)], { engineVersion: SIMULATION_ENGINE_VERSION });
      schedule({ type: "request-arrival", timeMs: arrivalMs, sourceId: source.id, request: { id: `request-${String(requestSequence++).padStart(7, "0")}`, arrivalMs, trace: [] } });
    }
  }
  let maxEventTimeMs = durationMs;
  while (events.size) {
    const event = events.pop();
    maxEventTimeMs = Math.max(maxEventTimeMs, event.timeMs);
    if (event.type === "request-arrival") {
      const edge = outgoing.get(event.sourceId)[0];
      edgeCounts.set(edge.id, edgeCounts.get(edge.id) + 1);
      enqueueRoute(edge.targetId, event.request, event.timeMs, edge.id);
      continue;
    }
    const node = nodeById.get(event.nodeId); const stats = nodeStats.get(event.nodeId);
    stats.active = Math.max(0, stats.active - 1); stats.completed += 1;
    const probability = failureOverrides[node.id] ?? failureOverrides[node.sourceEntityId] ?? node.parameters.failureProbability ?? 0;
    if (random() < probability) {
      stats.failures += 1; finishRequest(event.queued.request, "failed", event.timeMs);
    } else {
      const edge = outgoing.get(node.id)[0];
      if (!edge) finishRequest(event.queued.request, "success", event.timeMs);
      else {
        edgeCounts.set(edge.id, edgeCounts.get(edge.id) + 1);
        enqueueRoute(edge.targetId, { ...event.queued.request, trace: [...event.queued.request.trace, { nodeId: node.id, completedAtMs: event.timeMs }] }, event.timeMs, edge.id);
      }
    }
    const next = stats.waiting.shift();
    if (next) startService(node.id, next, event.timeMs);
  }
  const perNode = [...nodeStats.entries()].map(([nodeId, stats]) => {
    const node = nodeById.get(nodeId);
    const capacityMs = node.parameters.concurrency * durationMs;
    return {
      nodeId, sourceEntityId: node.sourceEntityId, label: node.label, kind: node.kind,
      arrivals: stats.arrivals, started: stats.started, completed: stats.completed,
      failed: stats.failures, dropped: stats.dropped,
      queueWaitMs: summarize(stats.queueWaits), serviceTimeMs: summarize(stats.serviceTimes),
      utilization: round(capacityMs > 0 ? Math.min(1, stats.busyObservedMs / capacityMs) : 0),
      busyObservedMs: round(stats.busyObservedMs),
    };
  }).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const successesPerSecond = terminal.successfulWithinWindow / (durationMs / 1000);
  const fingerprintInput = { sourceModelFingerprint: projection.provenance?.sourceModelFingerprint ?? null, simulationProfileFingerprint: projection.provenance?.simulationProfileFingerprint ?? null, engineVersion: SIMULATION_ENGINE_VERSION, durationMs, seed, scenarioOverrides };
  const runFingerprint = hash(fingerprintInput);
  const bottlenecks = perNode.filter((item) => item.utilization >= 0.8 || item.dropped > 0).sort((a, b) => b.utilization - a.utilization || b.dropped - a.dropped).map((item) => ({ nodeId: item.nodeId, sourceEntityId: item.sourceEntityId, utilization: item.utilization, dropped: item.dropped, signal: item.dropped > 0 ? "capacity-or-buffer-pressure-observed" : "high-utilization-observed" }));
  if (bottlenecks.length) diagnostics.push(makeDiagnostic("ENGINE-CAPACITY-PRESSURE-OBSERVED", "info", "Capacity pressure observed", `${bottlenecks.length} component(s) reached at least 80% observed utilization or dropped requests. These are model signals, not claims about a live deployment.`, { nodeIds: bottlenecks.map((item) => item.nodeId) }));
  return {
    status: "completed",
    result: {
      schemaVersion: SIMULATION_RESULT_SCHEMA_VERSION,
      simulation: { runFingerprint, engineVersion: SIMULATION_ENGINE_VERSION, seed, durationMs, drainDurationMs: round(Math.max(0, maxEventTimeMs - durationMs)), trafficMultiplier: multiplier, requestedFailureOverrides: structuredClone(failureOverrides), unavailableNodeIds: [...unavailableNodeIdSet].sort(), deterministic: true },
      metrics: {
        offeredRequests: totalOffered, successfulRequests: terminal.successful, successfulCompletionsWithinWindow: terminal.successfulWithinWindow, failedRequests: terminal.failed, droppedRequests: terminal.dropped,
        terminalRequests: terminal.successful + terminal.failed + terminal.dropped,
        successRate: round(totalOffered ? terminal.successful / totalOffered : 0),
        throughputRps: round(successesPerSecond),
        terminalLatencyMs: summarize(terminal.allLatencies), successfulLatencyMs: summarize(terminal.successfulLatencies),
        observationWindowMs: durationMs,
      },
      perNode, perEdge: edges.map((edge) => ({ edgeId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, requests: edgeCounts.get(edge.id) ?? 0, sourceRelationIds: edge.sourceRelationIds || [] })).sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
      bottlenecks,
      provenance: { sourceModelRevision: projection.provenance?.sourceModelRevision ?? null, sourceModelFingerprint: projection.provenance?.sourceModelFingerprint ?? null, simulationProfileFingerprint: projection.provenance?.simulationProfileFingerprint ?? null, engineVersion: SIMULATION_ENGINE_VERSION, runFingerprint },
    },
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code)),
    provenance: { engineVersion: SIMULATION_ENGINE_VERSION, sourceModelFingerprint: projection.provenance?.sourceModelFingerprint ?? null },
  };
}
