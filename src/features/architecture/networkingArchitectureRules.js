import { validateCidr } from "../../networkingResourceDefinitions.js";
function diagnostic({ code, severity, message, resourceId = null, relationshipId = null }) {
  return { code, severity, message, ...(resourceId ? { resourceId } : {}), ...(relationshipId ? { relationshipId } : {}), diagnosticId: [code, resourceId || "", relationshipId || ""].join("|") };
}
export const networkingArchitectureRules = Object.freeze([
  Object.freeze({ id: "networking-orphan-resources", validate(graph) {
    const connected = new Set();
    for (const relationship of graph.relationships || []) { connected.add(`${relationship.sourceProvider || relationship.provider}:${relationship.sourceResourceId}`); connected.add(`${relationship.targetProvider || relationship.provider}:${relationship.targetResourceId}`); }
    return (graph.resources || []).filter((r) => r.provider === "networking" && !connected.has(`networking:${r.resourceId}`) && !connected.has(`${r.provider}:${r.resourceId}`)).map((r) => diagnostic({ code: "NETWORKING_ORPHAN_RESOURCE", severity: ["load-balancer", "internet-gateway", "nat-gateway", "subnet", "firewall"].includes(r.resourceType) ? "warning" : "info", message: `${r.resourceType} has no explicit architecture connection.`, resourceId: r.resourceId }));
  }}),
  Object.freeze({ id: "networking-cidr", validate(graph) {
    const out = [];
    for (const r of graph.resources || []) {
      if (r.provider !== "networking" || !r.properties?.cidr) continue;
      const value = String(r.properties.cidr).trim();
      if (!validateCidr(value).valid) out.push(diagnostic({ code: "NETWORKING_INVALID_CIDR", severity: "error", message: `Invalid CIDR notation: ${value}`, resourceId: r.resourceId }));
    }
    return out;
  }}),
  Object.freeze({ id: "networking-gateway-relationships", validate(graph) {
    const out = [];
    const resources = graph.resources || [];
    const relationships = graph.relationships || [];
    const findResource = (id, provider) => resources.find((r) => r.resourceId === id && (!provider || r.provider === provider));
    for (const r of resources) {
      if (r.provider !== "networking" || r.resourceType !== "load-balancer" || r.properties?.networkType !== "public") continue;
      const related = relationships.filter((rel) =>
        (rel.sourceResourceId === r.resourceId && (rel.sourceProvider || rel.provider) === "networking") ||
        (rel.targetResourceId === r.resourceId && (rel.targetProvider || rel.provider) === "networking")
      );
      const hasGateway = related.some((rel) => {
        const otherId = rel.sourceResourceId === r.resourceId ? rel.targetResourceId : rel.sourceResourceId;
        const otherProvider = rel.sourceResourceId === r.resourceId ? (rel.targetProvider || rel.provider) : (rel.sourceProvider || rel.provider);
        const other = findResource(otherId, otherProvider);
        return other?.provider === "networking" && other.resourceType === "internet-gateway";
      });
      if (!hasGateway) out.push(diagnostic({ code: "NETWORKING_MISSING_GATEWAY_RELATIONSHIP", severity: "warning", message: "Public-facing load balancer has no explicit connection to an Internet Gateway. Confirm the intended network path.", resourceId: r.resourceId }));
    }
    return out;
  }})
]);
