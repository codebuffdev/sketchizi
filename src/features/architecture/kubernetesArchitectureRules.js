import {
  KUBERNETES_RELATIONSHIP_TYPES as SUPPORTED_KUBERNETES_RELATIONSHIP_TYPES,
  getCompatibleKubernetesRelationshipTypes,
  isKubernetesRelationshipTypeCompatible,
} from "../kubernetes-relationships/kubernetesRelationshipSemantics.js";
import { getKubernetesResourceDefinitionById } from "../../kubernetesResourceDefinitions.js";
import { validateKubernetesArchitectureCompleteness } from "./kubernetesArchitectureCompletenessRules.js";

const KUBERNETES_PROVIDER = "kubernetes";
const KUBERNETES_RELATIONSHIP_TYPES = new Set(SUPPORTED_KUBERNETES_RELATIONSHIP_TYPES);

function createDiagnostic({ code, severity, message, resourceId = null, relationshipId = null, remediation = null, suggestedRelationshipTypes = null, propertyKey = null, provider = KUBERNETES_PROVIDER }) {
  const identity = [code, provider || "", resourceId || "", relationshipId || "", propertyKey || ""].join("|");

  return {
    code,
    severity,
    message,
    ...(provider ? { provider } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(relationshipId ? { relationshipId } : {}),
    ...(propertyKey ? { propertyKey } : {}),
    ...(typeof remediation === "string" && remediation ? { remediation } : {}),
    ...(Array.isArray(suggestedRelationshipTypes) ? { suggestedRelationshipTypes } : {}),
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
    const compatibleRelationshipTypes = source && target
      ? getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType)
      : [...SUPPORTED_KUBERNETES_RELATIONSHIP_TYPES];

    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE",
      severity: "error",
      message: `Kubernetes relationship type "${String(relationship.relationshipType ?? "(missing)")}" is not supported.`,
      relationshipId: relationship.relationshipId,
      remediation: source && target
        ? "Choose a supported relationship type that is compatible with both endpoint resources."
        : "Choose one of the supported Kubernetes relationship types after confirming both connector endpoints.",
      suggestedRelationshipTypes: compatibleRelationshipTypes,
    }));
  }

  return diagnostics;
}

function validateKubernetesRelationshipPairs(graph) {
  const diagnostics = [];

  for (const relationship of kubernetesRelationships(graph)) {
    const source = resourceById(graph, relationship.sourceResourceId);
    const target = resourceById(graph, relationship.targetResourceId);
    if (!source || !target) continue;
    // Unknown types are reported by validateKubernetesRelationshipTypes. Avoid
    // producing a duplicate actionable finding for the same connector.
    if (!KUBERNETES_RELATIONSHIP_TYPES.has(relationship.relationshipType)) continue;
    if (isKubernetesRelationshipTypeCompatible(relationship.relationshipType, source.resourceType, target.resourceType)) continue;

    const compatibleRelationshipTypes = getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType);
    diagnostics.push(createDiagnostic({
      code: "KUBERNETES_INVALID_RELATIONSHIP",
      severity: "error",
      message: `Relationship type "${relationship.relationshipType}" is not valid for ${source.resourceType} → ${target.resourceType}.`,
      relationshipId: relationship.relationshipId,
      remediation: "Choose a relationship type compatible with both endpoint resource types.",
      suggestedRelationshipTypes: compatibleRelationshipTypes,
    }));
  }

  return diagnostics;
}


const NAMESPACED_KUBERNETES_RESOURCE_TYPES = new Set(["pod", "deployment", "statefulset", "daemonset", "service"]);
const KUBERNETES_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
const KUBERNETES_NAMESPACE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const KUBERNETES_VERSION = /^v?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/;

function validateKubernetesResourceProperties(graph) {
  const diagnostics = [];

  for (const resource of kubernetesResources(graph)) {
    const definition = getKubernetesResourceDefinitionById(resource.definitionId);
    // Catalog metadata from older/custom files may not have a current definition.
    // Relationship validation should still work for those resources.
    if (!definition || definition.resourceType !== resource.resourceType) continue;

    const properties = resource.properties && typeof resource.properties === "object" ? resource.properties : {};
    const knownProperties = new Map(definition.properties.map((property) => [property.key, property]));

    for (const [key, property] of knownProperties) {
      const value = properties[key];
      let problem = null;
      let remediation = null;

      if (key === "name") {
        const namePattern = resource.resourceType === "namespace" ? KUBERNETES_NAMESPACE_NAME : KUBERNETES_NAME;
        if (typeof value !== "string" || !value.trim()) {
          problem = `${property.label} is required.`;
          remediation = "Enter a non-empty Kubernetes resource name.";
        } else if (!namePattern.test(value)) {
          problem = `${property.label} must be a valid lowercase Kubernetes name.`;
          remediation = resource.resourceType === "namespace"
            ? "Use 1–63 lowercase letters or digits, with hyphens allowed between characters; do not use spaces, underscores, or dots."
            : "Use a lowercase DNS-style name with letters, digits, hyphens, and optional dot-separated labels; each label must start and end with a letter or digit.";
        }
      } else if (key === "namespace" && NAMESPACED_KUBERNETES_RESOURCE_TYPES.has(resource.resourceType)) {
        if (typeof value !== "string" || !KUBERNETES_NAMESPACE_NAME.test(value)) {
          problem = `${property.label} must be a valid Kubernetes namespace name.`;
          remediation = "Use a namespace name containing 1–63 lowercase letters or digits, with hyphens allowed between characters.";
        }
      } else if (property.type === "number") {
        const numberValue = typeof value === "number" ? value : (typeof value === "string" && value.trim() ? Number(value) : NaN);
        if (!Number.isInteger(numberValue) || numberValue < 0) {
          problem = `${property.label} must be a non-negative integer.`;
          remediation = "Set the value to a whole number greater than or equal to 0.";
        }
      } else if (property.type === "select" && Array.isArray(property.options) && !property.options.includes(value)) {
        problem = `${property.label} must be one of the supported values.`;
        remediation = `Choose one of: ${property.options.join(", ")}.`;
      } else if (key === "version" && (typeof value !== "string" || !KUBERNETES_VERSION.test(value))) {
        problem = `${property.label} must look like a Kubernetes version, for example 1.34.`;
        remediation = "Enter a major.minor version such as 1.34, optionally with a patch version or a v prefix.";
      }

      if (!problem) continue;
      diagnostics.push(createDiagnostic({
        code: "KUBERNETES_INVALID_RESOURCE_PROPERTY",
        severity: "error",
        message: `Kubernetes ${resource.resourceType} ${JSON.stringify(resource.resourceId)}: ${problem}`,
        resourceId: resource.resourceId,
        propertyKey: key,
        remediation,
      }));
    }
  }

  return diagnostics;
}

function validateKubernetesNamespaceDependencies(graph) {
  const diagnostics = [];
  const resources = kubernetesResources(graph);
  const relationships = kubernetesRelationships(graph);
  const namespaces = resources.filter((resource) => resource.resourceType === "namespace");

  for (const resource of resources) {
    if (!NAMESPACED_KUBERNETES_RESOURCE_TYPES.has(resource.resourceType)) continue;
    const namespaceName = resource.properties?.namespace;
    if (typeof namespaceName !== "string" || !KUBERNETES_NAMESPACE_NAME.test(namespaceName) || namespaceName === "default") continue;

    const namespace = namespaces.find((candidate) => candidate.properties?.name === namespaceName);
    if (!namespace) {
      diagnostics.push(createDiagnostic({
        code: "KUBERNETES_MISSING_NAMESPACE_DEPENDENCY",
        severity: "warning",
        message: `Kubernetes ${resource.resourceType} ${JSON.stringify(resource.resourceId)} targets namespace "${namespaceName}", but that Namespace is not represented in the diagram.`,
        resourceId: resource.resourceId,
        propertyKey: "namespace",
        remediation: `Add a Namespace resource named "${namespaceName}" and connect it to this resource, or change the namespace property to an existing namespace. The built-in default namespace is not flagged.`,
      }));
      continue;
    }

    const hasContainsRelationship = relationships.some((relationship) =>
      relationship.sourceResourceId === namespace.resourceId &&
      relationship.targetResourceId === resource.resourceId &&
      relationship.relationshipType === "contains",
    );
    if (!hasContainsRelationship) {
      diagnostics.push(createDiagnostic({
        code: "KUBERNETES_MISSING_NAMESPACE_RELATIONSHIP",
        severity: "warning",
        message: `Kubernetes ${resource.resourceType} ${JSON.stringify(resource.resourceId)} uses namespace "${namespaceName}" but is not connected from that Namespace with a contains relationship.`,
        resourceId: resource.resourceId,
        propertyKey: "namespace",
        remediation: `Add a contains relationship from Namespace "${namespaceName}" to this resource to make the namespace dependency explicit.`,
      }));
    }
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
      message: `Kubernetes ${resource.resourceType || "resource"} has no relationships.`,
      resourceId: resource.resourceId,
      remediation: "Connect this resource to related Kubernetes resources, or remove it if it is not part of this design.",
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
      remediation: "Assign each Kubernetes resource a unique resource ID, then update any relationships that reference the changed ID.",
    }));
  }

  return diagnostics;
}

export const kubernetesArchitectureRules = Object.freeze([
  Object.freeze({ id: "kubernetes-relationship-type", validate: validateKubernetesRelationshipTypes }),
  Object.freeze({ id: "kubernetes-relationship-pair", validate: validateKubernetesRelationshipPairs }),
  Object.freeze({ id: "kubernetes-resource-properties", validate: validateKubernetesResourceProperties }),
  Object.freeze({ id: "kubernetes-namespace-dependencies", validate: validateKubernetesNamespaceDependencies }),
  Object.freeze({ id: "kubernetes-orphan-resource", validate: validateKubernetesOrphans }),
  Object.freeze({ id: "kubernetes-duplicate-resource-id", validate: validateKubernetesDuplicateResourceIds }),
  Object.freeze({ id: "kubernetes-architecture-completeness", validate: validateKubernetesArchitectureCompleteness }),
]);
