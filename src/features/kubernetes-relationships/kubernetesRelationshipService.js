export const KUBERNETES_RELATIONSHIP_TYPES = [
  "connects-to",
  "contains",
  "schedules",
  "exposes",
  "runs-on",
];

const KUBERNETES_RELATIONSHIP_TYPE = KUBERNETES_RELATIONSHIP_TYPES[0];

function normalizeRelationshipType(relationshipType) {
  return KUBERNETES_RELATIONSHIP_TYPES.includes(relationshipType)
    ? relationshipType
    : KUBERNETES_RELATIONSHIP_TYPE;
}
const CONNECTOR_TYPES = new Set(["arrow", "line"]);

function relationshipIdForConnector(connector) {
  return `k8s-relationship-${connector.id}`;
}

function getKubernetesResourceId(element) {
  if (!element || element.isDeleted) return null;
  return element.customData?.kubernetesResource?.kubernetesResourceId || null;
}

function getBoundResourceId(connector, bindingKey, elementsById) {
  const binding = connector?.[bindingKey];
  if (!binding?.elementId) return null;
  return getKubernetesResourceId(elementsById.get(binding.elementId));
}

function buildRelationshipMetadata(connector, sourceResourceId, targetResourceId) {
  const existingRelationship = connector.customData?.kubernetesRelationship;
  return {
    relationshipId: relationshipIdForConnector(connector),
    sourceResourceId,
    targetResourceId,
    relationshipType: normalizeRelationshipType(existingRelationship?.relationshipType ?? KUBERNETES_RELATIONSHIP_TYPE),
  };
}

function sameRelationship(a, b) {
  return Boolean(
    a &&
    b &&
    a.relationshipId === b.relationshipId &&
    a.sourceResourceId === b.sourceResourceId &&
    a.targetResourceId === b.targetResourceId &&
    a.relationshipType === b.relationshipType,
  );
}

function withRelationshipMetadata(element, relationship) {
  return {
    ...element,
    customData: {
      ...(element.customData || {}),
      kubernetesRelationship: relationship,
    },
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

function withoutRelationshipMetadata(element) {
  if (!element.customData?.kubernetesRelationship) return element;
  const { kubernetesRelationship: _removed, ...customData } = element.customData;
  return {
    ...element,
    customData,
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

/**
 * Synchronize Kubernetes relationship metadata from normal Excalidraw connectors.
 *
 * Metadata is attached only when both bindings resolve to intelligent Kubernetes
 * resources. Relationship identity is tied to the connector element ID.
 */
export function syncKubernetesRelationshipMetadata(elements) {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const liveResourceIds = new Set(
    elements
      .filter((element) => !element.isDeleted)
      .map(getKubernetesResourceId)
      .filter(Boolean),
  );

  let changed = false;
  const nextElements = elements.map((element) => {
    if (!CONNECTOR_TYPES.has(element.type)) return element;

    const existingRelationship = element.customData?.kubernetesRelationship;
    const sourceResourceId = getBoundResourceId(element, "startBinding", elementsById);
    const targetResourceId = getBoundResourceId(element, "endBinding", elementsById);

    if (sourceResourceId && targetResourceId) {
      const relationship = buildRelationshipMetadata(element, sourceResourceId, targetResourceId);
      if (sameRelationship(existingRelationship, relationship)) return element;
      changed = true;
      return withRelationshipMetadata(element, relationship);
    }

    if (existingRelationship) {
      const sourceStillExists = liveResourceIds.has(existingRelationship.sourceResourceId);
      const targetStillExists = liveResourceIds.has(existingRelationship.targetResourceId);
      if (!sourceStillExists || !targetStillExists || !sourceResourceId || !targetResourceId) {
        changed = true;
        return withoutRelationshipMetadata(element);
      }
    }

    return element;
  });

  return { elements: nextElements, changed };
}

export function getKubernetesRelationship(element) {
  return element?.customData?.kubernetesRelationship || null;
}

export function updateKubernetesRelationshipMetadata(elements, relationshipId, patch = {}) {
  let changed = false;
  const nextElements = elements.map((element) => {
    const relationship = element.customData?.kubernetesRelationship;
    if (!relationship || relationship.relationshipId !== relationshipId) return element;

    const nextRelationship = {
      ...relationship,
      ...patch,
      relationshipId: relationship.relationshipId,
      relationshipType: normalizeRelationshipType(patch.relationshipType ?? relationship.relationshipType),
    };
    if (sameRelationship(relationship, nextRelationship)) return element;

    changed = true;
    return withRelationshipMetadata(element, nextRelationship);
  });

  return { elements: nextElements, changed };
}
