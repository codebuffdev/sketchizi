import { validateKubernetesArchitectureCompleteness } from "./kubernetesArchitectureCompletenessRules.js";
import { getCompatibleKubernetesRelationshipTypes } from "../kubernetes-relationships/kubernetesRelationshipSemantics.js";
import { getKubernetesResourceDefinitionById } from "../../kubernetesResourceDefinitions.js";

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

function createDiagnostic({ code, severity, message, remediation = null, resourceId = null, relationshipId = null, propertyKey = null, suggestedRelationshipTypes = null }) {
  const identity = [code, resourceId || "", relationshipId || ""].join("|");

  return {
    code,
    severity,
    message,
    ...(resourceId ? { resourceId } : {}),
    ...(relationshipId ? { relationshipId } : {}),
    ...(propertyKey ? { propertyKey } : {}),
    ...(remediation ? { remediation } : {}),
    ...(Array.isArray(suggestedRelationshipTypes) ? { suggestedRelationshipTypes } : {}),
    provider: KUBERNETES_PROVIDER,
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

    const source = resourceById(graph, relationship.sourceResourceId);
    const target = resourceById(graph, relationship.targetResourceId);
    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE",
      severity: "error",
      message: `Kubernetes relationship type “${relationship.relationshipType}” is not supported.`,
      remediation: "Choose a supported relationship type for these endpoint resources.",
      relationshipId: relationship.relationshipId,
      suggestedRelationshipTypes: source && target
        ? getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType)
        : [],
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
      message: `Relationship type “${relationship.relationshipType}” is not compatible with ${source.resourceType} → ${target.resourceType}.`,
      remediation: "Choose a compatible relationship type for the selected endpoint resources.",
      relationshipId: relationship.relationshipId,
      suggestedRelationshipTypes: getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType),
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
      message: `Kubernetes ${resource.resourceType} resource has no relationships.`,
      remediation: "Connect this resource to a related resource or remove it if it is not needed.",
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


const NAMESPACED_KUBERNETES_RESOURCE_TYPES = new Set([
  "pod", "deployment", "statefulset", "daemonset", "service",
]);

function isValidKubernetesName(value, maxLength = 253) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength &&
    /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
}

function createPropertyDiagnostic(resource, property, message, remediation) {
  return createDiagnostic({
    code: "KUBERNETES_INVALID_RESOURCE_PROPERTY",
    severity: "error",
    message,
    remediation,
    resourceId: resource.resourceId,
    propertyKey: property.key,
  });
}

function validateKubernetesResourceProperties(graph) {
  const diagnostics = [];
  for (const resource of kubernetesResources(graph)) {
    const definition = getKubernetesResourceDefinitionById(resource.definitionId);
    // Unknown definitions may be user-created or from an older catalog. Do not
    // infer constraints that were not part of their original contract.
    if (!definition) continue;

    for (const property of definition.properties || []) {
      const value = resource.properties?.[property.key];
      if (property.key === "name") {
        const maxLength = resource.resourceType === "namespace" ? 63 : 253;
        if (typeof value !== "string" || value.trim().length === 0) {
          diagnostics.push(createPropertyDiagnostic(
            resource, property,
            `${property.label} is required for Kubernetes ${resource.resourceType}.`,
            `Provide a lowercase Kubernetes name such as "${property.defaultValue || "my-resource"}" using letters, numbers, and hyphens.`,
          ));
        } else if (!isValidKubernetesName(value, maxLength)) {
          diagnostics.push(createPropertyDiagnostic(
            resource, property,
            `${property.label} must be a valid lowercase Kubernetes name.`,
            `Use a lowercase Kubernetes name such as "${property.defaultValue || "my-resource"}" with letters and numbers separated by hyphens; maximum length is ${maxLength}.`,
          ));
        }
        continue;
      }

      if (property.type === "number" && (!Number.isInteger(value) || value < 0)) {
        diagnostics.push(createPropertyDiagnostic(
          resource, property,
          `${property.label} must be a non-negative integer.`,
          `Set ${property.label.toLowerCase()} to a whole number greater than or equal to 0.`,
        ));
        continue;
      }

      if (property.type === "select" && !property.options?.includes(value)) {
        diagnostics.push(createPropertyDiagnostic(
          resource, property,
          `${property.label} must be one of the supported values: ${(property.options || []).join(", ")}.`,
          `Choose one of the supported values: ${(property.options || []).join(", ")}.`,
        ));
        continue;
      }

      if (resource.resourceType === "cluster" && property.key === "version" &&
          (typeof value !== "string" || !/^1\.\d{1,2}$/.test(value))) {
        diagnostics.push(createPropertyDiagnostic(
          resource, property,
          "Kubernetes cluster version must use the major.minor format.",
          "Use a Kubernetes version such as 1.34, then verify that it is supported by your target cluster environment.",
        ));
      }
    }
  }
  return diagnostics;
}

function validateKubernetesNamespaceDependencies(graph) {
  const diagnostics = [];
  const namespaces = kubernetesResources(graph).filter((resource) => resource.resourceType === "namespace");
  const namespacedResources = kubernetesResources(graph).filter((resource) => NAMESPACED_KUBERNETES_RESOURCE_TYPES.has(resource.resourceType));

  for (const resource of namespacedResources) {
    const namespaceName = resource.properties?.namespace || "default";
    if (namespaceName === "default") continue;
    const matchingNamespaces = namespaces.filter((namespace) => namespace.properties?.name === namespaceName);
    if (matchingNamespaces.length === 0) {
      diagnostics.push(createDiagnostic({
        code: "KUBERNETES_MISSING_NAMESPACE_DEPENDENCY",
        severity: "warning",
        message: `Kubernetes ${resource.resourceType} references namespace "${namespaceName}", but no matching Namespace resource exists.`,
        remediation: `Add a Namespace resource named "${namespaceName}" and connect it to this resource with a contains relationship.`,
        resourceId: resource.resourceId,
      }));
      continue;
    }

    const hasContainment = matchingNamespaces.some((namespace) => graph.relationships.some((relationship) =>
      relationship.provider === KUBERNETES_PROVIDER && relationship.relationshipType === "contains" &&
      relationship.sourceResourceId === namespace.resourceId && relationship.targetResourceId === resource.resourceId
    ));
    if (!hasContainment) {
      diagnostics.push(createDiagnostic({
        code: "KUBERNETES_MISSING_NAMESPACE_RELATIONSHIP",
        severity: "warning",
        message: `Kubernetes ${resource.resourceType} references namespace "${namespaceName}" without an explicit contains relationship.`,
        remediation: `Connect the Namespace resource "${namespaceName}" to this resource using a contains relationship.`,
        resourceId: resource.resourceId,
      }));
    }
  }
  return diagnostics;
}

export const kubernetesArchitectureRules = Object.freeze([
  Object.freeze({ id: "kubernetes-relationship-type", validate: validateKubernetesRelationshipTypes }),
  Object.freeze({ id: "kubernetes-relationship-pair", validate: validateKubernetesRelationshipPairs }),
  Object.freeze({ id: "kubernetes-orphan-resource", validate: validateKubernetesOrphans }),
  Object.freeze({ id: "kubernetes-duplicate-resource-id", validate: validateKubernetesDuplicateResourceIds }),
  Object.freeze({ id: "kubernetes-resource-properties", validate: validateKubernetesResourceProperties }),
  Object.freeze({ id: "kubernetes-namespace-dependencies", validate: validateKubernetesNamespaceDependencies }),
  Object.freeze({ id: "kubernetes-architecture-completeness", validate: validateKubernetesArchitectureCompleteness }),
]);
