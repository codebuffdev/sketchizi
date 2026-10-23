const CRITICAL_ROLES = new Set(["gateway", "api", "service", "database", "datastore", "queue", "broker", "worker", "storage"]);

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function diagnostic(code, severity, title, message, nodeIds = []) {
  return { code, severity, title, message, nodeIds, diagnosticId: `${code}:${nodeIds.join(",")}` };
}

/**
 * Analyze a generic system-design graph without mutating it. Nodes accept
 * { id, name, type, role, replicas, availabilityZones }; edges accept
 * { sourceId, targetId, type }. Unknown metadata is deliberately not inferred.
 */
export function analyzeSystemDesignArchitecture(input = {}) {
  const safeInput = input && typeof input === "object" ? input : {};
  const nodes = Array.isArray(safeInput.nodes) ? input.nodes.filter((node) => node && node.id != null) : [];
  const edges = Array.isArray(safeInput.edges) ? input.edges.filter((edge) => edge && edge.sourceId != null && edge.targetId != null) : [];
  const diagnostics = [];
  const ids = new Set(nodes.map((node) => String(node.id)));
  const degree = new Map(nodes.map((node) => [String(node.id), 0]));

  for (const edge of edges) {
    const sourceId = String(edge.sourceId);
    const targetId = String(edge.targetId);
    if (!ids.has(sourceId) || !ids.has(targetId)) {
      diagnostics.push(diagnostic("EDGE_ENDPOINT_MISSING", "error", "Connection endpoint missing", "A connection references a component that is not present in this architecture.", [sourceId, targetId]));
      continue;
    }
    degree.set(sourceId, degree.get(sourceId) + 1);
    degree.set(targetId, degree.get(targetId) + 1);
    if (sourceId === targetId) diagnostics.push(diagnostic("SELF_CONNECTION", "warning", "Self-connection", "A component is connected to itself. Confirm that this loop is intentional.", [sourceId]));
  }

  for (const node of nodes) {
    const id = String(node.id);
    const role = normalizeName(node.role || node.type || node.name);
    const replicas = Number(node.replicas);
    const zones = Number(node.availabilityZones);
    if (degree.get(id) === 0) diagnostics.push(diagnostic("ISOLATED_COMPONENT", "warning", "Unconnected component", `${node.name || node.type || "This component"} has no connections. Connect it to the request or data flow, or remove it if unused.`, [id]));
    const critical = [...CRITICAL_ROLES].some((candidate) => role === candidate || role.includes(candidate));
    if (critical && Number.isFinite(replicas) && replicas <= 1) diagnostics.push(diagnostic("SINGLE_REPLICA_CRITICAL_COMPONENT", "warning", "Potential single point of failure", `${node.name || node.type || "This critical component"} is configured with ${replicas} replica. Consider redundancy if availability requirements demand it.`, [id]));
    if (critical && Number.isFinite(zones) && zones <= 1) diagnostics.push(diagnostic("SINGLE_ZONE_CRITICAL_COMPONENT", "info", "Single-zone placement", `${node.name || node.type || "This critical component"} is configured for one availability zone. Consider multi-zone placement if required by the target availability level.`, [id]));
  }

  const edgeKeys = new Set();
  for (const edge of edges) {
    const key = `${edge.sourceId}->${edge.targetId}:${normalizeName(edge.type)}`;
    if (edgeKeys.has(key)) diagnostics.push(diagnostic("DUPLICATE_CONNECTION", "warning", "Duplicate connection", "This connection duplicates another connection with the same direction and type.", [String(edge.sourceId), String(edge.targetId)]));
    edgeKeys.add(key);
  }

  const unique = [...new Map(diagnostics.map((item) => [item.diagnosticId, item])).values()];
  return {
    diagnostics: unique,
    errors: unique.filter((item) => item.severity === "error"),
    warnings: unique.filter((item) => item.severity === "warning"),
    info: unique.filter((item) => item.severity === "info"),
    summary: { components: nodes.length, connections: edges.length, errors: unique.filter((item) => item.severity === "error").length, warnings: unique.filter((item) => item.severity === "warning").length, info: unique.filter((item) => item.severity === "info").length },
  };
}

/** Additional advisory checks for request-path reachability and resilience. */
export function analyzeSystemDesignQuality(input = {}) {
  const base = analyzeSystemDesignArchitecture(input);
  const nodes = Array.isArray(input?.nodes) ? input.nodes.filter((node) => node && node.id != null) : [];
  const edges = Array.isArray(input?.edges) ? input.edges.filter((edge) => edge && edge.sourceId != null && edge.targetId != null) : [];
  const diagnostics = [...base.diagnostics];
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const outgoing = new Map(nodes.map((node) => [String(node.id), []]));
  const incoming = new Map(nodes.map((node) => [String(node.id), []]));
  for (const edge of edges) {
    const source = String(edge.sourceId), target = String(edge.targetId);
    if (outgoing.has(source) && incoming.has(target)) { outgoing.get(source).push(target); incoming.get(target).push(source); }
  }
  const roleOf = (node) => normalizeName(node?.role || node?.type || node?.name);
  const isIngress = (node) => /client|user|browser|mobile|ingress|load.?balancer|gateway/.test(roleOf(node));
  const isData = (node) => /database|datastore|storage|object.?store|cache|search.?index/.test(roleOf(node));
  const ingressNodes = nodes.filter(isIngress);
  if (nodes.length > 1 && ingressNodes.length === 0) {
    diagnostics.push(diagnostic("REQUEST_ENTRY_UNDEFINED", "info", "Request entry point not identified", "No client, ingress, gateway, or load-balancer role was identified. Mark the intended entry point to enable request-path reachability checks."));
  } else if (ingressNodes.length) {
    const reachable = new Set();
    const stack = ingressNodes.map((node) => String(node.id));
    while (stack.length) {
      const current = stack.pop();
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const next of outgoing.get(current) || []) if (!reachable.has(next)) stack.push(next);
    }
    for (const node of nodes) {
      const id = String(node.id);
      if (!reachable.has(id) && !isIngress(node)) diagnostics.push(diagnostic("UNREACHABLE_FROM_INGRESS", "warning", "Not reachable from request entry", `${node.name || node.type || "This component"} is not reachable by following the diagram's directed connections from the identified request entry point. Confirm direction or intended background processing.`, [id]));
    }
  }
  for (const node of nodes) {
    const id = String(node.id), role = roleOf(node);
    const fanIn = incoming.get(id)?.length || 0;
    if (isData(node) && fanIn >= 3 && !/cache/.test(role) && node.cachePresent !== true) {
      diagnostics.push(diagnostic("SHARED_DATA_HOTSPOT_REVIEW", "info", "Review shared data access", `${node.name || node.type || "This data component"} receives connections from ${fanIn} components. If reads are frequent, assess caching, indexing, connection pooling, and capacity before adding infrastructure.`, [id]));
    }
    const traffic = normalizeName(node.trafficPattern || node.workload || "");
    if (/high|spiky|burst/.test(traffic) && /api|service|worker|processor/.test(role) && Number.isFinite(Number(node.replicas)) && Number(node.replicas) < 2) {
      diagnostics.push(diagnostic("BURST_CAPACITY_REVIEW", "warning", "Review burst capacity", `${node.name || node.type || "This component"} is marked for high or bursty traffic but has fewer than two replicas. Assess autoscaling, queueing, rate limits, and downstream capacity.`, [id]));
    }
  }
  // Detect directed cycles; report the cycle once per sorted set of participating nodes.
  const visiting = new Set(), visited = new Set(), cycleSets = new Set();
  function visit(id, path = []) {
    if (visiting.has(id)) {
      const start = path.indexOf(id); const cycle = path.slice(start).sort();
      if (cycle.length) cycleSets.add(cycle.join(","));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) visit(next, [...path, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const node of nodes) visit(String(node.id));
  for (const cycle of cycleSets) {
    const ids = cycle.split(",");
    diagnostics.push(diagnostic("DIRECTED_DEPENDENCY_CYCLE", "info", "Directed dependency cycle", "A directed cycle exists in the connection graph. Confirm that feedback or bidirectional flow is intentional and will not create retry or dependency loops.", ids));
  }
  const unique = [...new Map(diagnostics.map((item) => [item.diagnosticId, item])).values()];
  return { ...base, diagnostics: unique, errors: unique.filter((item) => item.severity === "error"), warnings: unique.filter((item) => item.severity === "warning"), info: unique.filter((item) => item.severity === "info"), summary: { components: nodes.length, connections: edges.length, errors: unique.filter((item) => item.severity === "error").length, warnings: unique.filter((item) => item.severity === "warning").length, info: unique.filter((item) => item.severity === "info").length } };
}
