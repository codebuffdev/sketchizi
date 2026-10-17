function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function queueCompare(a, b) { return a.virtualTimeMs - b.virtualTimeMs || a.sequence - b.sequence; }

export function createSimulation(graph, options = {}) {
  const config = { seed: 1, maxEvents: 10000, maxVirtualTimeMs: 3600000, maxTokens: 1000, ...options };
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of graph.edges) outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) || []), edge]);
  const random = seededRandom(config.seed);
  const state = {
    status: "ready", runId: `${Date.now().toString(36)}-${Math.floor(random() * 0x7fffffff).toString(36)}`,
    virtualTimeMs: 0, eventsProcessed: 0, sequence: 0, tokenSequence: 0,
    queue: [], tokens: {}, eventLog: [], metrics: { started: 0, completed: 0, failed: 0, failedAttempts: 0, retries: 0, maxQueueDepth: 0, latencySamples: [] },
    error: null,
  };
  const log = (type, message, details = {}) => {
    state.eventLog.push({ id: `${state.runId}:${state.eventLog.length + 1}`, timeMs: state.virtualTimeMs, type, message, ...details });
    if (state.eventLog.length > 2000) state.eventLog.shift();
  };
  const schedule = (virtualTimeMs, tokenId, nodeId, eventType, data = {}) => {
    if (state.queue.length >= config.maxEvents) throw new Error(`Maximum scheduled event limit (${config.maxEvents}) reached.`);
    state.queue.push({ runId: state.runId, virtualTimeMs, sequence: state.sequence++, tokenId, nodeId, eventType, data });
    state.metrics.maxQueueDepth = Math.max(state.metrics.maxQueueDepth, state.queue.length);
    state.queue.sort(queueCompare);
  };
  const route = (token, node, outcome = "success") => {
    const edges = (outgoing.get(node.id) || []).filter((edge) => edge.condition === "always" || edge.condition === outcome || edge.condition === token.context.branch);
    if (!edges.length) {
      token.status = outcome === "failure" ? "failed" : "completed";
      token.finishedAtMs = state.virtualTimeMs;
      if (token.status === "failed") state.metrics.failed += 1;
      else {
        state.metrics.completed += 1;
        state.metrics.latencySamples.push(Math.max(0, state.virtualTimeMs - (token.startedAtMs || 0)));
      }
      log(token.status, `${node.label} ${token.status}.`, { tokenId: token.id, nodeId: node.id });
      return;
    }
    for (const [edgeIndex, edge] of edges.entries()) {
      if (Object.values(state.tokens).filter((item) => item.status === "active" || item.status === "waiting").length >= config.maxTokens) throw new Error(`Maximum active token limit (${config.maxTokens}) reached.`);
      const nextToken = edgeIndex > 0 ? { ...token, id: `token-${++state.tokenSequence}`, context: { ...token.context }, attemptsByNode: { ...token.attemptsByNode } } : token;
      nextToken.currentNodeId = edge.targetId;
      nextToken.status = "waiting";
      state.tokens[nextToken.id] = nextToken;
      schedule(state.virtualTimeMs + Math.max(0, edge.latencyMs || 0), nextToken.id, edge.targetId, "arrive");
      log("routed", `Token routed to ${nodes.get(edge.targetId)?.label || edge.targetId}.`, { tokenId: nextToken.id, edgeId: edge.id, nodeId: edge.targetId });
    }
  };
  const failOrRetry = (token, node, reason) => {
    state.metrics.failedAttempts += 1;
    const attempts = token.attemptsByNode[node.id] || 0;
    const maxRetries = Math.max(0, Math.min(20, Number(node.config.maxRetries) || 0));
    if (attempts < maxRetries) {
      token.attemptsByNode[node.id] = attempts + 1;
      state.metrics.retries += 1;
      const backoff = Math.max(0, Number(node.config.retryDelayMs) || 0) * Math.pow(Math.max(1, Number(node.config.backoffMultiplier) || 1), attempts);
      token.status = "waiting";
      log("retry", `${node.label} failed; retry ${attempts + 1} scheduled.`, { tokenId: token.id, nodeId: node.id, reason });
      schedule(state.virtualTimeMs + backoff, token.id, node.id, "arrive", { retry: true });
    } else {
      log("failure", `${node.label} failed: ${reason}`, { tokenId: token.id, nodeId: node.id });
      route(token, node, "failure");
    }
  };
  const processEvent = (event) => {
    if (event.runId !== state.runId) return;
    state.virtualTimeMs = event.virtualTimeMs;
    state.eventsProcessed += 1;
    const token = state.tokens[event.tokenId];
    const node = nodes.get(event.nodeId);
    if (!token || !node) { log("warning", "Skipped event with missing token or node."); return; }
    token.status = "active";
    token.currentNodeId = node.id;
    if (event.eventType === "complete") {
      log("completed-step", `${node.label} completed.`, { tokenId: token.id, nodeId: node.id });
      if (node.type === "end") { token.status = "completed"; token.finishedAtMs = state.virtualTimeMs; state.metrics.completed += 1; state.metrics.latencySamples.push(Math.max(0, state.virtualTimeMs - (token.startedAtMs || 0))); log("completed", "Flow completed.", { tokenId: token.id, nodeId: node.id }); }
      else route(token, node, event.data.outcome || "success");
      return;
    }
    if (node.type === "end") {
      token.status = "completed";
      token.finishedAtMs = state.virtualTimeMs;
      state.metrics.completed += 1;
      state.metrics.latencySamples.push(Math.max(0, state.virtualTimeMs - (token.startedAtMs || 0)));
      log("completed", "Flow completed.", { tokenId: token.id, nodeId: node.id });
      return;
    }
    if (node.type === "decision") {
      const probability = Math.max(0, Math.min(1, Number(node.config.trueProbability ?? 0.5)));
      const desired = node.config.branchOutcome || (random() < probability ? "true" : "false");
      const edges = outgoing.get(node.id) || [];
      const matching = edges.filter((edge) => edge.condition === "always" || edge.condition === desired);
      if (matching.length) {
        for (const [edgeIndex, edge] of matching.entries()) {
          const branchToken = edgeIndex > 0 ? { ...token, id: `token-${++state.tokenSequence}`, context: { ...token.context }, attemptsByNode: { ...token.attemptsByNode } } : token;
          branchToken.currentNodeId = edge.targetId;
          branchToken.status = "waiting";
          state.tokens[branchToken.id] = branchToken;
          schedule(state.virtualTimeMs + Math.max(0, edge.latencyMs || 0), branchToken.id, edge.targetId, "arrive");
        }
        log("decision", `${node.label} selected ${desired}.`, { tokenId: token.id, nodeId: node.id });
      } else route(token, node, "success");
      return;
    }
    if (node.type === "start") { state.metrics.started += 1; log("started", `${node.label} started.`, { tokenId: token.id, nodeId: node.id }); route(token, node); return; }
    const probability = Math.max(0, Math.min(1, Number(node.config.failureProbability) || 0));
    if (random() < probability) { failOrRetry(token, node, "configured failure injection"); return; }
    const duration = Math.max(0, Number(node.config.durationMs ?? 100) || 0);
    token.startedAtMs ??= state.virtualTimeMs;
    token.status = "waiting";
    log("processing", `${node.label} processing (${duration} ms).`, { tokenId: token.id, nodeId: node.id });
    schedule(state.virtualTimeMs + duration, token.id, node.id, "complete", { outcome: "success" });
  };
  for (const entryNodeId of graph.entryNodeIds) {
    const token = { id: `token-${++state.tokenSequence}`, currentNodeId: entryNodeId, status: "waiting", context: { branch: config.branch || null }, attemptsByNode: {}, startedAtMs: 0 };
    state.tokens[token.id] = token;
    schedule(0, token.id, entryNodeId, "arrive");
  }
  log("ready", "Simulation initialized.", { seed: config.seed });
  return {
    getState: () => ({ ...state, queue: [...state.queue], tokens: Object.fromEntries(Object.entries(state.tokens).map(([id, token]) => [id, { ...token, context: { ...token.context }, attemptsByNode: { ...token.attemptsByNode } }])), eventLog: [...state.eventLog], metrics: { ...state.metrics, latencySamples: [...state.metrics.latencySamples] } }),
    step() {
      if (state.status === "failed" || state.status === "stopped" || state.status === "completed") return this.getState();
      if (state.eventsProcessed >= config.maxEvents) { state.status = "failed"; state.error = `Maximum processed event limit (${config.maxEvents}) reached.`; log("error", state.error); return this.getState(); }
      const next = state.queue.shift();
      if (!next) { state.status = "completed"; log("completed", "No pending events remain."); return this.getState(); }
      if (next.virtualTimeMs > config.maxVirtualTimeMs) { state.status = "failed"; state.error = `Maximum virtual duration (${config.maxVirtualTimeMs} ms) exceeded.`; log("error", state.error); return this.getState(); }
      try { processEvent(next); } catch (error) { state.status = "failed"; state.error = error instanceof Error ? error.message : String(error); log("error", state.error); }
      if (state.status !== "failed" && state.queue.length === 0) { state.status = "completed"; log("completed", "No pending events remain."); }
      else if (state.status === "ready") state.status = "running";
      return this.getState();
    },
    pause() { if (state.status === "running") state.status = "paused"; return this.getState(); },
    resume() { if (state.status === "paused" || state.status === "ready") state.status = "running"; return this.getState(); },
    stop() { state.status = "stopped"; state.queue = []; log("stopped", "Simulation stopped."); return this.getState(); },
    runToCompletion() { let result = this.getState(); let guard = 0; while (!["completed", "failed", "stopped"].includes(result.status) && guard++ < config.maxEvents + 1) result = this.step(); return result; },
  };
}
