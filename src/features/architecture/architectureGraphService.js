import { AWS_RELATIONSHIP_TYPES } from "../aws-relationships/awsRelationshipService.js";
import { KUBERNETES_RELATIONSHIP_TYPES } from "../kubernetes-relationships/kubernetesRelationshipService.js";

const DIAGNOSTIC_CODES = Object.freeze({
  MALFORMED_RESOURCE: "MALFORMED_RESOURCE",
  DUPLICATE_ELEMENT_ID: "DUPLICATE_ELEMENT_ID",
  MISSING_SOURCE_RESOURCE: "MISSING_SOURCE_RESOURCE",
  MISSING_TARGET_RESOURCE: "MISSING_TARGET_RESOURCE",
  INVALID_RELATIONSHIP_TYPE: "INVALID_RELATIONSHIP_TYPE",
  MALFORMED_RELATIONSHIP: "MALFORMED_RELATIONSHIP",
});

const PROVIDERS = Object.freeze({ AWS: "aws", KUBERNETES: "kubernetes" });
const RESOURCE_METADATA = Object.freeze({
  [PROVIDERS.AWS]: {
    key: "awsResource",
    idKey: "awsResourceId",
    relationshipKey: "awsRelationship",
    relationshipTypes: AWS_RELATIONSHIP_TYPES,
  },
  [PROVIDERS.KUBERNETES]: {
    key: "kubernetesResource",
    idKey: "kubernetesResourceId",
    relationshipKey: "kubernetesRelationship",
    relationshipTypes: KUBERNETES_RELATIONSHIP_TYPES,
  },
});

function diagnostic(code, message, details = {}) {
  return { code, message, ...details };
}

function getProviderResourceMetadata(element, provider) {
  if (!element || element.isDeleted) return null;
  return element.customData?.[RESOURCE_METADATA[provider].key] || null;
}

function getProviderRelationshipMetadata(element, provider) {
  if (!element || element.isDeleted) return null;
  return element.customData?.[RESOURCE_METADATA[provider].relationshipKey] || null;
}

function resourceIdForMetadata(resource, provider) {
  return resource?.[RESOURCE_METADATA[provider].idKey] || null;
}

function resourceKey(provider, resourceId) {
  return `${provider}:${resourceId}`;
}

function isValidResourceMetadata(resource, provider) {
  const idKey = RESOURCE_METADATA[provider].idKey;
  return Boolean(
    resource &&
    typeof resource === "object" &&
    typeof resource[idKey] === "string" &&
    resource[idKey].length > 0 &&
    typeof resource.definitionId === "string" &&
    resource.definitionId.length > 0 &&
    typeof resource.provider === "string" &&
    resource.provider.length > 0 &&
    typeof resource.resourceType === "string" &&
    resource.resourceType.length > 0 &&
    resource.properties &&
    typeof resource.properties === "object" &&
    !Array.isArray(resource.properties)
  );
}

function normalizedResource(resource, provider) {
  const resourceId = resourceIdForMetadata(resource, provider);
  return {
    resourceId,
    resourceKey: resourceKey(provider, resourceId),
    definitionId: resource.definitionId,
    provider: resource.provider,
    service: resource.service || (provider === PROVIDERS.KUBERNETES ? "Kubernetes" : ""),
    resourceType: resource.resourceType,
    properties: { ...resource.properties },
  };
}

function hasRelationshipStructure(relationship) {
  return Boolean(
    relationship &&
    typeof relationship === "object" &&
    typeof relationship.relationshipId === "string" &&
    relationship.relationshipId.length > 0 &&
    typeof relationship.sourceResourceId === "string" &&
    relationship.sourceResourceId.length > 0 &&
    typeof relationship.targetResourceId === "string" &&
    relationship.targetResourceId.length > 0 &&
    typeof relationship.relationshipType === "string" &&
    relationship.relationshipType.length > 0
  );
}

function relationshipForGraph(relationship, provider) {
  return {
    relationshipId: relationship.relationshipId,
    provider,
    sourceResourceId: relationship.sourceResourceId,
    targetResourceId: relationship.targetResourceId,
    relationshipType: relationship.relationshipType,
  };
}

/**
 * Derive the unified architecture graph from the current Excalidraw scene.
 * Excalidraw elements remain the source of truth and are never mutated.
 */
export function analyzeArchitectureGraph(elements = []) {
  const scene = Array.isArray(elements) ? elements : [];
  const diagnostics = [];
  const resourcesByKey = new Map();
  const elementIds = new Set();

  for (const element of scene) {
    if (!element || typeof element !== "object") continue;

    if (typeof element.id === "string" && elementIds.has(element.id)) {
      diagnostics.push(diagnostic(
        DIAGNOSTIC_CODES.DUPLICATE_ELEMENT_ID,
        "Scene contains duplicate element IDs.",
        { elementId: element.id },
      ));
      continue;
    }

    if (typeof element.id === "string") elementIds.add(element.id);

    for (const provider of Object.keys(RESOURCE_METADATA)) {
      const resource = getProviderResourceMetadata(element, provider);
      if (!resource) continue;

      if (!isValidResourceMetadata(resource, provider)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.MALFORMED_RESOURCE,
          `${provider === PROVIDERS.AWS ? "AWS" : "Kubernetes"} resource metadata is malformed.`,
          { elementId: element.id },
        ));
        continue;
      }

      const resourceId = resourceIdForMetadata(resource, provider);
      const key = resourceKey(provider, resourceId);
      if (!resourcesByKey.has(key)) {
        resourcesByKey.set(key, normalizedResource(resource, provider));
      }
    }
  }

  const relationships = [];
  const relationshipIds = new Set();

  for (const element of scene) {
    if (!element || typeof element !== "object") continue;

    for (const provider of Object.keys(RESOURCE_METADATA)) {
      const relationship = getProviderRelationshipMetadata(element, provider);
      if (!relationship) continue;

      if (!hasRelationshipStructure(relationship)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.MALFORMED_RELATIONSHIP,
          `${provider === PROVIDERS.AWS ? "AWS" : "Kubernetes"} relationship metadata is malformed.`,
          { elementId: element.id, relationshipId: relationship.relationshipId },
        ));
        continue;
      }

      const sourceKey = resourceKey(provider, relationship.sourceResourceId);
      const targetKey = resourceKey(provider, relationship.targetResourceId);

      if (!resourcesByKey.has(sourceKey)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.MISSING_SOURCE_RESOURCE,
          "Relationship source resource does not exist.",
          { relationshipId: relationship.relationshipId, sourceResourceId: relationship.sourceResourceId },
        ));
        continue;
      }

      if (!resourcesByKey.has(targetKey)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.MISSING_TARGET_RESOURCE,
          "Relationship target resource does not exist.",
          { relationshipId: relationship.relationshipId, targetResourceId: relationship.targetResourceId },
        ));
        continue;
      }

      if (!RESOURCE_METADATA[provider].relationshipTypes.includes(relationship.relationshipType)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.INVALID_RELATIONSHIP_TYPE,
          "Relationship type is not supported.",
          { relationshipId: relationship.relationshipId, relationshipType: relationship.relationshipType },
        ));
        continue;
      }

      const graphRelationship = relationshipForGraph(relationship, provider);
      if (relationshipIds.has(`${provider}:${relationship.relationshipId}`)) {
        diagnostics.push(diagnostic(
          DIAGNOSTIC_CODES.MALFORMED_RELATIONSHIP,
          "Duplicate relationship IDs are not valid in the derived graph.",
          { relationshipId: relationship.relationshipId },
        ));
        continue;
      }

      relationshipIds.add(`${provider}:${relationship.relationshipId}`);
      relationships.push(graphRelationship);
    }
  }

  return {
    resources: [...resourcesByKey.values()],
    relationships,
    diagnostics,
  };
}

export function getResource(graph, resourceId, provider = null) {
  if (!graph || !resourceId) return null;
  return graph.resources.find((resource) =>
    resource.resourceId === resourceId && (!provider || resource.provider === provider)
  ) || null;
}

function relationshipMatchesResource(relationship, resourceId, provider = null) {
  if (!relationship || relationship.provider !== (provider || relationship.provider)) return false;
  return relationship.sourceResourceId === resourceId || relationship.targetResourceId === resourceId;
}

export function getRelationshipsForResource(graph, resourceId, provider = null) {
  if (!graph || !resourceId) return [];
  return graph.relationships.filter((relationship) =>
    relationshipMatchesResource(relationship, resourceId, provider)
  );
}

export function getOutgoingRelationships(graph, resourceId, provider = null) {
  if (!graph || !resourceId) return [];
  return graph.relationships.filter((relationship) =>
    relationship.sourceResourceId === resourceId && (!provider || relationship.provider === provider)
  );
}

export function getIncomingRelationships(graph, resourceId, provider = null) {
  if (!graph || !resourceId) return [];
  return graph.relationships.filter((relationship) =>
    relationship.targetResourceId === resourceId && (!provider || relationship.provider === provider)
  );
}

export function getResourceNeighbors(graph, resourceId, provider = null) {
  if (!graph || !resourceId) return [];

  const neighborKeys = new Set();
  for (const relationship of getRelationshipsForResource(graph, resourceId, provider)) {
    const relationshipProvider = relationship.provider;
    if (relationship.sourceResourceId === resourceId) {
      neighborKeys.add(resourceKey(relationshipProvider, relationship.targetResourceId));
    }
    if (relationship.targetResourceId === resourceId) {
      neighborKeys.add(resourceKey(relationshipProvider, relationship.sourceResourceId));
    }
  }

  return [...neighborKeys]
    .map((key) => graph.resources.find((resource) => resource.resourceKey === key))
    .filter(Boolean);
}

export { DIAGNOSTIC_CODES };
