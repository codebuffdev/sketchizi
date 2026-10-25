import { getCompatibleKubernetesRelationshipTypes } from "../kubernetes-relationships/kubernetesRelationshipSemantics.js";

const TYPE_BY_ICON = Object.freeze({
  "k8s:group": "cluster",
  "k8s:namespace": "namespace",
  "k8s:node": "node",
  "k8s:pod": "pod",
  "k8s:deployment": "deployment",
  "k8s:statefulset": "statefulset",
  "k8s:daemonset": "daemonset",
  "k8s:service": "service",
});

const PREFERRED_RELATIONSHIPS = Object.freeze([
  ["cluster", "namespace", "contains"],
  ["namespace", "deployment", "contains"],
  ["namespace", "statefulset", "contains"],
  ["namespace", "daemonset", "contains"],
  ["namespace", "service", "contains"],
  ["namespace", "pod", "contains"],
  ["deployment", "pod", "schedules"],
  ["statefulset", "pod", "schedules"],
  ["daemonset", "pod", "schedules"],
  ["service", "pod", "exposes"],
  ["pod", "node", "runs-on"],
]);

/**
 * Build a deterministic, conservative relationship plan from selected catalog icons.
 * Only resource kinds supported by the intelligent resource definitions participate.
 */
export function buildKubernetesArchitecturePlan(icons = []) {
  const resources = (Array.isArray(icons) ? icons : []).map((icon, index) => ({
    id: icon?.id,
    name: icon?.name || icon?.id || "Resource",
    resourceType: TYPE_BY_ICON[icon?.id] || null,
    index,
  })).filter((resource) => resource.id);

  const relationships = [];
  const connected = new Set();
  for (const [sourceType, targetType, relationshipType] of PREFERRED_RELATIONSHIPS) {
    const source = resources.find((resource) => resource.resourceType === sourceType && !connected.has(resource.index));
    const target = resources.find((resource) => resource.resourceType === targetType && !connected.has(resource.index));
    if (!source || !target) continue;
    if (!getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType).includes(relationshipType)) continue;
    relationships.push({
      sourceIndex: source.index,
      targetIndex: target.index,
      sourceName: source.name,
      targetName: target.name,
      relationshipType,
    });
    connected.add(source.index);
    connected.add(target.index);
  }

  const unsupported = resources.filter((resource) => !resource.resourceType);
  const unconnected = resources.filter((resource) => resource.resourceType && !connected.has(resource.index));
  return {
    resources,
    relationships,
    diagnostics: [
      ...unsupported.map((resource) => ({
        severity: "warning",
        code: "unsupported-resource",
        message: `${resource.name} is a catalog icon, not an intelligent resource type, so it will be added without semantic links.`,
      })),
      ...unconnected.map((resource) => ({
        severity: "info",
        code: "unconnected-resource",
        message: `${resource.name} has no compatible relationship in this selection; review its connections after insertion.`,
      })),
    ],
  };
}
