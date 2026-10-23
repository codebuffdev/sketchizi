const array = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? "").trim();

function nodeSignature(node) {
  return JSON.stringify({ name: clean(node.name), type: clean(node.type), role: clean(node.role), replicas: node.replicas ?? null, availabilityZones: array(node.availabilityZones).map(clean).sort() });
}
function edgeSignature(edge) {
  return JSON.stringify({ sourceId: clean(edge.sourceId), targetId: clean(edge.targetId), type: clean(edge.type || "connection") });
}

/** Deterministic structural diff. IDs are the primary identity; edge IDs are deliberately ignored. */
export function diffSystemDesignGraphs(baseline = {}, candidate = {}) {
  const leftNodes = array(baseline?.nodes).filter((item) => item && item.id != null);
  const rightNodes = array(candidate?.nodes).filter((item) => item && item.id != null);
  const leftById = new Map(leftNodes.map((item) => [String(item.id), item]));
  const rightById = new Map(rightNodes.map((item) => [String(item.id), item]));
  const addedNodes = rightNodes.filter((item) => !leftById.has(String(item.id))).map((item) => ({ id: String(item.id), name: clean(item.name) || clean(item.type) || "Component", after: item }));
  const removedNodes = leftNodes.filter((item) => !rightById.has(String(item.id))).map((item) => ({ id: String(item.id), name: clean(item.name) || clean(item.type) || "Component", before: item }));
  const changedNodes = rightNodes.flatMap((after) => {
    const before = leftById.get(String(after.id));
    if (!before || nodeSignature(before) === nodeSignature(after)) return [];
    const fields = ["name", "type", "role", "replicas", "availabilityZones"].filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
    return [{ id: String(after.id), name: clean(after.name) || clean(before.name) || "Component", fields, before, after }];
  });
  const edgeKey = (edge) => edgeSignature(edge);
  const leftEdges = array(baseline?.edges).filter((item) => item && item.sourceId != null && item.targetId != null);
  const rightEdges = array(candidate?.edges).filter((item) => item && item.sourceId != null && item.targetId != null);
  const leftEdgeCounts = new Map();
  const rightEdgeCounts = new Map();
  leftEdges.forEach((edge) => leftEdgeCounts.set(edgeKey(edge), (leftEdgeCounts.get(edgeKey(edge)) || 0) + 1));
  rightEdges.forEach((edge) => rightEdgeCounts.set(edgeKey(edge), (rightEdgeCounts.get(edgeKey(edge)) || 0) + 1));
  const edgeDiff = (from, to) => {
    const remaining = new Map(to);
    const result = [];
    for (const edge of from) {
      const key = edgeKey(edge);
      const count = remaining.get(key) || 0;
      if (count > 0) remaining.set(key, count - 1);
      else result.push({ sourceId: String(edge.sourceId), targetId: String(edge.targetId), type: clean(edge.type || "connection") });
    }
    return result;
  };
  const addedConnections = edgeDiff(rightEdges, leftEdgeCounts);
  const removedConnections = edgeDiff(leftEdges, rightEdgeCounts);
  return {
    addedComponents: addedNodes,
    removedComponents: removedNodes,
    changedComponents: changedNodes,
    addedConnections,
    removedConnections,
    counts: { addedComponents: addedNodes.length, removedComponents: removedNodes.length, changedComponents: changedNodes.length, addedConnections: addedConnections.length, removedConnections: removedConnections.length },
    note: "Structural comparison uses component IDs as identity. If IDs differ between equivalent designs, components appear as removed and added. This is not a runtime performance or cost comparison."
  };
}
