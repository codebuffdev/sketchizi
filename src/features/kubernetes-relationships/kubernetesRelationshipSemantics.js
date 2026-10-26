/**
 * Shared Kubernetes relationship semantics used by the authoring UI and validator.
 * Keep this mapping provider-local so AWS and Networking rules remain independent.
 */
export const KUBERNETES_RELATIONSHIP_TYPES = Object.freeze([
  "connects-to",
  "contains",
  "schedules",
  "exposes",
  "runs-on",
]);

const SEMANTIC_PAIRS = new Map([
  ["contains", new Set([
    "cluster->namespace",
    ...[
      "pod", "deployment", "statefulset", "daemonset", "replicaset", "job", "cronjob",
      "service", "ingress", "configmap", "secret", "persistentvolumeclaim", "serviceaccount",
      "role", "rolebinding", "resourcequota", "limitrange", "networkpolicy",
      "horizontalpodautoscaler", "poddisruptionbudget", "servicemonitor", "endpointslice",
    ].map((kind) => `namespace->${kind}`),
  ])],
  ["schedules", new Set([
    "deployment->replicaset",
    "deployment->pod",
    "replicaset->pod",
    "statefulset->pod",
    "daemonset->pod",
    "job->pod",
    "cronjob->job",
  ])],
  ["exposes", new Set(["service->pod"])],
  ["runs-on", new Set(["pod->node"])],
]);

export function isKubernetesRelationshipTypeCompatible(relationshipType, sourceResourceType, targetResourceType) {
  if (!KUBERNETES_RELATIONSHIP_TYPES.includes(relationshipType)) return false;
  if (relationshipType === "connects-to") return true;
  if (typeof sourceResourceType !== "string" || typeof targetResourceType !== "string") return false;
  return SEMANTIC_PAIRS.get(relationshipType)?.has(`${sourceResourceType}->${targetResourceType}`) || false;
}

export function getCompatibleKubernetesRelationshipTypes(sourceResourceType, targetResourceType) {
  if (typeof sourceResourceType !== "string" || typeof targetResourceType !== "string") return [];
  return KUBERNETES_RELATIONSHIP_TYPES.filter((relationshipType) =>
    isKubernetesRelationshipTypeCompatible(relationshipType, sourceResourceType, targetResourceType));
}
