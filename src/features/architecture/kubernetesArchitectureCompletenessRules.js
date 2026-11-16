const KUBERNETES_PROVIDER = "kubernetes";
const WORKLOAD_CONTROLLER_TYPES = new Set(["deployment", "statefulset", "daemonset"]);

function createCompletenessDiagnostic({ code, severity = "info", message, resourceId = null, relationshipId = null, recommendedResourceTypes = [], remediation }) {
  return {
    code,
    severity,
    provider: KUBERNETES_PROVIDER,
    ...(resourceId ? { resourceId } : {}),
    ...(relationshipId ? { relationshipId } : {}),
    message,
    remediation,
    ...(recommendedResourceTypes.length ? { recommendedResourceTypes } : {}),
    diagnosticId: [code, KUBERNETES_PROVIDER, resourceId || "", relationshipId || ""].join("|"),
  };
}

function getKubernetesResources(graph) {
  return graph.resources.filter((resource) => resource.provider === KUBERNETES_PROVIDER);
}

function getKubernetesRelationships(graph) {
  return graph.relationships.filter((relationship) => relationship.provider === KUBERNETES_PROVIDER);
}

function hasRelationship(relationships, sourceResourceId, targetResourceId, relationshipType) {
  return relationships.some((relationship) =>
    relationship.sourceResourceId === sourceResourceId &&
    relationship.targetResourceId === targetResourceId &&
    relationship.relationshipType === relationshipType,
  );
}

/**
 * Report optional architecture-completeness recommendations. These are not
 * Kubernetes API conformance errors: a diagram may intentionally omit runtime
 * resources. Findings are read-only and never modify the Excalidraw scene.
 */
export function validateKubernetesArchitectureCompleteness(graph) {
  const resources = getKubernetesResources(graph);
  if (resources.length === 0) return [];

  const relationships = getKubernetesRelationships(graph);
  const diagnostics = [];
  const clusters = resources.filter((resource) => resource.resourceType === "cluster");
  const namespaces = resources.filter((resource) => resource.resourceType === "namespace");
  const pods = resources.filter((resource) => resource.resourceType === "pod");
  const controllers = resources.filter((resource) => WORKLOAD_CONTROLLER_TYPES.has(resource.resourceType));
  const services = resources.filter((resource) => resource.resourceType === "service");

  if (clusters.length === 0) {
    diagnostics.push(createCompletenessDiagnostic({
      code: "KUBERNETES_CLUSTER_CONTEXT_RECOMMENDED",
      severity: "info",
      message: "This Kubernetes diagram has no Cluster resource to establish its deployment context.",
      remediation: "If this diagram represents a deployed environment, consider adding a Kubernetes Cluster and connecting it to its Namespace resources with contains relationships. Workload-only diagrams can ignore this recommendation.",
      recommendedResourceTypes: ["cluster"],
    }));
  }

  if (clusters.length > 0 && namespaces.length > 0) {
    for (const namespace of namespaces) {
      const hasClusterParent = clusters.some((cluster) =>
        hasRelationship(relationships, cluster.resourceId, namespace.resourceId, "contains"),
      );
      if (hasClusterParent) continue;
      diagnostics.push(createCompletenessDiagnostic({
        code: "KUBERNETES_CLUSTER_NAMESPACE_LINK_MISSING",
        severity: "warning",
        message: `Namespace ${JSON.stringify(namespace.resourceId)} is not connected from any represented Cluster with a contains relationship.`,
        resourceId: namespace.resourceId,
        remediation: `Add a contains relationship from the Cluster that owns Namespace ${JSON.stringify(namespace.resourceId)}. Skip this recommendation when the cluster boundary is intentionally out of scope.`,
        recommendedResourceTypes: [],
      }));
    }
  }

  for (const controller of controllers) {
    const hasScheduledPod = relationships.some((relationship) => {
      if (relationship.sourceResourceId !== controller.resourceId || relationship.relationshipType !== "schedules") return false;
      return pods.some((pod) => pod.resourceId === relationship.targetResourceId);
    });
    if (hasScheduledPod) continue;

    diagnostics.push(createCompletenessDiagnostic({
      code: "KUBERNETES_CONTROLLER_POD_MODEL_MISSING",
      severity: "warning",
      message: `${controller.resourceType} ${JSON.stringify(controller.resourceId)} has no modeled Pod connected with a schedules relationship.`,
      resourceId: controller.resourceId,
      remediation: "For a workload-level diagram, add the relevant Pod resource and connect the controller to it with a schedules relationship. Omit this finding if Pod details are intentionally abstracted.",
      recommendedResourceTypes: ["pod"],
    }));
  }

  for (const service of services) {
    const hasExposedPod = relationships.some((relationship) => {
      if (relationship.sourceResourceId !== service.resourceId || relationship.relationshipType !== "exposes") return false;
      return pods.some((pod) => pod.resourceId === relationship.targetResourceId);
    });
    if (hasExposedPod) continue;

    diagnostics.push(createCompletenessDiagnostic({
      code: "KUBERNETES_SERVICE_POD_TARGET_RECOMMENDED",
      severity: "info",
      message: `Service ${JSON.stringify(service.resourceId)} has no modeled Pod target connected with an exposes relationship.`,
      resourceId: service.resourceId,
      remediation: "If this diagram documents service routing, connect the Service to the Pod or Pods it selects with exposes relationships. Services whose target details are outside the diagram can ignore this recommendation.",
      recommendedResourceTypes: pods.length === 0 ? ["pod"] : [],
    }));
  }

  for (const pod of pods) {
    const hasNodeAssignment = relationships.some((relationship) =>
      relationship.sourceResourceId === pod.resourceId &&
      relationship.relationshipType === "runs-on" &&
      resources.some((resource) => resource.provider === KUBERNETES_PROVIDER && resource.resourceType === "node" && resource.resourceId === relationship.targetResourceId),
    );
    if (hasNodeAssignment) continue;

    diagnostics.push(createCompletenessDiagnostic({
      code: "KUBERNETES_POD_NODE_PLACEMENT_RECOMMENDED",
      severity: "info",
      message: `Pod ${JSON.stringify(pod.resourceId)} has no modeled Node assignment.`,
      resourceId: pod.resourceId,
      remediation: "For a placement-focused diagram, add a Node and connect the Pod to it with a runs-on relationship. Kubernetes may schedule Pods dynamically, so this detail is optional.",
      recommendedResourceTypes: resources.some((resource) => resource.provider === KUBERNETES_PROVIDER && resource.resourceType === "node") ? [] : ["node"],
    }));
  }

  return diagnostics;
}
