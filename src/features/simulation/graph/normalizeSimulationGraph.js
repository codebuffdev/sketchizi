const SHAPE_TYPES = new Set(["rectangle", "diamond", "ellipse", "text"]);

function resolveBindingId(binding) {
  return binding?.elementId || binding?.id || null;
}

export function normalizeSimulationGraph(elements = [], options = {}) {
  const { domain = "process" } = options;
  const live = elements.filter((element) => !element.isDeleted);
  const byId = new Map(live.map((element) => [element.id, element]));
  const nodes = live
    .filter((element) => SHAPE_TYPES.has(element.type) && element.type !== "text")
    .map((element) => {
      const metadata = element.customData?.simulation || {};
      const inferredType = metadata.nodeType || (element.type === "diamond" ? "decision" : element.type === "ellipse" ? "start" : "task");
      return {
        id: element.id,
        type: inferredType,
        config: { ...(metadata.config || {}) },
        label: typeof element.text === "string" && element.text.trim() ? element.text.trim() : inferredType,
        sourceType: element.type,
      };
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = live.filter((element) => element.type === "arrow" || element.type === "line").flatMap((element) => {
    const sourceId = resolveBindingId(element.startBinding);
    const targetId = resolveBindingId(element.endBinding);
    if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) return [];
    const metadata = element.customData?.simulation || {};
    return [{ id: element.id, sourceId, targetId, condition: metadata.condition || "always", latencyMs: metadata.latencyMs ?? 0, config: { ...(metadata.config || {}) } }];
  });
  const incoming = new Set(edges.map((edge) => edge.targetId));
  const entryNodeIds = nodes.filter((node) => node.type === "start" || !incoming.has(node.id)).map((node) => node.id);
  return { schemaVersion: 1, domain, nodes, edges, entryNodeIds, diagnostics: {
    unboundConnectors: live.filter((element) => (element.type === "arrow" || element.type === "line") && (!resolveBindingId(element.startBinding) || !resolveBindingId(element.endBinding))).map((element) => element.id),
    unsupportedConnectorTargets: live.filter((element) => (element.type === "arrow" || element.type === "line") && resolveBindingId(element.startBinding) && resolveBindingId(element.endBinding) && (!byId.has(resolveBindingId(element.startBinding)) || !byId.has(resolveBindingId(element.endBinding)))).map((element) => element.id),
  } };
}

export function validateSimulationGraph(graph) {
  const issues = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!graph.nodes.length) issues.push({ severity: "error", code: "empty-graph", message: "Add at least one shape before running a simulation." });
  if (!graph.entryNodeIds.length && graph.nodes.length) issues.push({ severity: "error", code: "no-entry", message: "No entry node could be identified." });
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) issues.push({ severity: "error", code: "invalid-edge", message: `Connector ${edge.id} references a missing node.` });
    if (!Number.isFinite(edge.latencyMs) || edge.latencyMs < 0) issues.push({ severity: "error", code: "invalid-latency", message: `Connector ${edge.id} has invalid latency.` });
  }
  for (const node of graph.nodes) {
    const duration = node.config.durationMs ?? 100;
    if (!Number.isFinite(duration) || duration < 0) issues.push({ severity: "error", code: "invalid-duration", message: `Node ${node.label} has an invalid duration.` });
    const probability = node.config.failureProbability ?? 0;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) issues.push({ severity: "error", code: "invalid-failure-probability", message: `Node ${node.label} failure probability must be between 0 and 1.` });
  }
  if (graph.diagnostics?.unboundConnectors?.length) issues.push({ severity: "warning", code: "unbound-connectors", message: `${graph.diagnostics.unboundConnectors.length} connector(s) have no bound endpoints and will be ignored.` });
  return issues;
}
