import {
  getCompatibleKubernetesRelationshipTypes,
  isKubernetesRelationshipTypeCompatible,
} from "../kubernetes-relationships/kubernetesRelationshipSemantics.js";
import { updateKubernetesRelationshipMetadata } from "../kubernetes-relationships/kubernetesRelationshipService.js";

const FIXABLE_DIAGNOSTICS = new Set([
  "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE",
  "KUBERNETES_INVALID_RELATIONSHIP",
]);

function resourceForId(elements, resourceId) {
  return (Array.isArray(elements) ? elements : []).find((element) =>
    !element?.isDeleted && element?.customData?.kubernetesResource?.kubernetesResourceId === resourceId
  )?.customData?.kubernetesResource || null;
}

/**
 * Apply a narrowly scoped Kubernetes relationship correction after an explicit
 * user action. It revalidates the live scene so stale diagnostics cannot apply
 * a now-incompatible choice, and changes only relationshipType.
 */
export function applyKubernetesRelationshipSuggestion(elements, diagnostic, relationshipType) {
  const scene = Array.isArray(elements) ? elements : [];
  if (diagnostic?.provider !== "kubernetes" || !FIXABLE_DIAGNOSTICS.has(diagnostic?.code) || !diagnostic?.relationshipId) {
    return { changed: false, elements: scene, error: "This finding does not support an automatic Kubernetes relationship correction." };
  }

  if (!Array.isArray(diagnostic.suggestedRelationshipTypes) || !diagnostic.suggestedRelationshipTypes.includes(relationshipType)) {
    return { changed: false, elements: scene, error: "That relationship type was not suggested for this finding. Run validation again." };
  }

  const matchingConnectors = scene.filter((element) =>
    !element?.isDeleted && element?.customData?.kubernetesRelationship?.relationshipId === diagnostic.relationshipId
  );
  if (matchingConnectors.length > 1) {
    return { changed: false, elements: scene, error: "This relationship ID is duplicated. Resolve the duplicate IDs and run validation again." };
  }
  const connector = matchingConnectors[0];
  const current = connector?.customData?.kubernetesRelationship;
  if (!connector || !current) {
    return { changed: false, elements: scene, error: "The connector no longer exists. Run validation again." };
  }
  if (
    (typeof diagnostic.relationshipType === "string" && current.relationshipType !== diagnostic.relationshipType) ||
    (typeof diagnostic.sourceResourceId === "string" && current.sourceResourceId !== diagnostic.sourceResourceId) ||
    (typeof diagnostic.targetResourceId === "string" && current.targetResourceId !== diagnostic.targetResourceId)
  ) {
    return { changed: false, elements: scene, error: "The connector changed after this finding was created. Run validation again." };
  }

  const source = resourceForId(scene, current.sourceResourceId);
  const target = resourceForId(scene, current.targetResourceId);
  if (!source || !target) {
    return { changed: false, elements: scene, error: "Both Kubernetes relationship endpoints must exist before this correction can be applied." };
  }
  if (
    (typeof diagnostic.sourceResourceType === "string" && source.resourceType !== diagnostic.sourceResourceType) ||
    (typeof diagnostic.targetResourceType === "string" && target.resourceType !== diagnostic.targetResourceType)
  ) {
    return { changed: false, elements: scene, error: "An endpoint resource changed after this finding was created. Run validation again." };
  }

  const compatibleTypes = getCompatibleKubernetesRelationshipTypes(source.resourceType, target.resourceType);
  if (!compatibleTypes.includes(relationshipType)) {
    return { changed: false, elements: scene, error: "That type is no longer compatible with the current endpoint resources. Run validation again." };
  }
  if (isKubernetesRelationshipTypeCompatible(current.relationshipType, source.resourceType, target.resourceType)) {
    return { changed: false, elements: scene, error: "This relationship is already compatible. Run validation again before applying a correction." };
  }

  const result = updateKubernetesRelationshipMetadata(scene, current.relationshipId, { relationshipType });
  if (!result.changed) {
    return { changed: false, elements: scene, error: "The relationship did not require a change." };
  }
  return { changed: true, elements: result.elements, relationshipId: current.relationshipId, relationshipType };
}
