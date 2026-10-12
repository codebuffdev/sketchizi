const KUBERNETES_PROVIDER = "kubernetes";

const KUBERNETES_RELATIONSHIP_TYPES = new Set([
  "connects-to",
  "contains",
  "schedules",
  "exposes",
  "runs-on",
]);

const KUBERNETES_SEMANTIC_PAIRS = new Map([
  ["contains", new Set([
    "cluster->namespace",
    "namespace->pod",
    "namespace->deployment",
    "namespace->statefulset",
    "namespace->daemonset",
    "namespace->service",
  ])],
  ["schedules", new Set([
    "deployment->pod",
    "statefulset->pod",
    "daemonset->pod",
  ])],
  ["exposes", new Set(["service->pod"])],
  ["runs-on", new Set(["pod->node"])],
]);

function createDiagnostic({ code, severity, message, resourceId = null, relationshipId = null }) {
  const identity = [code, resourceId || "", relationshipId || ""].join("|");

  return {
    code,
    severity,
    message,
    ...(resourceId ? { resourceId } : {}),
    ...(relationshipId ? { relationshipId } : {}),
    diagnosticId: identity,
  };
}

function kubernetesResources(graph) {
  return graph.resources.filter((resource) => resource.provider === KUBERNETES_PROVIDER);
}

function kubernetesRelationships(graph) {
  return graph.relationships.filter((relationship) => relationship.provider === KUBERNETES_PROVIDER);
}

function resourceById(graph, resourceId) {
  return graph.resources.find(
    (resource) => resource.provider === KUBERNETES_PROVIDER && resource.resourceId === resourceId,
  ) || null;
}

function validateKubernetesRelationshipTypes(graph) {
  const diagnostics = [];

  for (const relationship of kubernetesRelationships(graph)) {
    if (KUBERNETES_RELATIONSHIP_TYPES.has(relationship.relationshipType)) continue;

    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE",
      severity: "error",
      message: "Kubernetes relationship type is not supported.",
      relationshipId: relationship.relationshipId,
    }));
  }

  return diagnostics;
}

function validateKubernetesRelationshipPairs(graph) {
  const diagnostics = [];

  for (const relationship of kubernetesRelationships(graph)) {
    if (relationship.relationshipType === "connects-to") continue;

    const source = resourceById(graph, relationship.sourceResourceId);
    const target = resourceById(graph, relationship.targetResourceId);
    if (!source || !target) continue;

    const supportedPairs = KUBERNETES_SEMANTIC_PAIRS.get(relationship.relationshipType);
    if (!supportedPairs) continue;

    const pair = `${source.resourceType}->${target.resourceType}`;
    if (supportedPairs.has(pair)) continue;

    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_INVALID_RELATIONSHIP",
      severity: "error",
      message: "Kubernetes relationship type is not valid for the selected resource types.",
      relationshipId: relationship.relationshipId,
    }));
  }

  return diagnostics;
}

function validateKubernetesOrphans(graph) {
  const diagnostics = [];
  const relationshipResourceIds = new Set();

  for (const relationship of kubernetesRelationships(graph)) {
    relationshipResourceIds.add(relationship.sourceResourceId);
    relationshipResourceIds.add(relationship.targetResourceId);
  }

  for (const resource of kubernetesResources(graph)) {
    if (relationshipResourceIds.has(resource.resourceId)) continue;

    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_ORPHAN_RESOURCE",
      severity: "info",
      message: "Kubernetes resource has no relationships.",
      resourceId: resource.resourceId,
    }));
  }

  return diagnostics;
}

function validateKubernetesDuplicateResourceIds(graph) {
  const diagnostics = [];
  const resourceIds = new Set();
  const reportedIds = new Set();

  for (const resource of kubernetesResources(graph)) {
    if (!resourceIds.has(resource.resourceId)) {
      resourceIds.add(resource.resourceId);
      continue;
    }

    if (reportedIds.has(resource.resourceId)) continue;
    reportedIds.add(resource.resourceId);

    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_DUPLICATE_RESOURCE_ID",
      severity: "error",
      message: "Duplicate Kubernetes resource ID detected.",
      resourceId: resource.resourceId,
    }));
  }

  return diagnostics;
}

export const kubernetesArchitectureRules = Object.freeze([
  Object.freeze({ id: "kubernetes-relationship-type", validate: validateKubernetesRelationshipTypes }),
  Object.freeze({ id: "kubernetes-relationship-pair", validate: validateKubernetesRelationshipPairs }),
  Object.freeze({ id: "kubernetes-orphan-resource", validate: validateKubernetesOrphans }),
  Object.freeze({ id: "kubernetes-duplicate-resource-id", validate: validateKubernetesDuplicateResourceIds }),
]);
