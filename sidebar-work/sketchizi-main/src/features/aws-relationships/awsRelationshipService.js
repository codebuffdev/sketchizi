export const AWS_RELATIONSHIP_TYPES = [
  "connects-to",
  "invokes",
  "reads-from",
  "writes-to",
  "publishes-to",
  "subscribes-to",
  "routes-to",
  "depends-on",
];

const AWS_RELATIONSHIP_TYPE = AWS_RELATIONSHIP_TYPES[0];
const CONNECTOR_TYPES = new Set(["arrow", "line"]);

function relationshipIdForConnector(connector) {
  return `aws-relationship-${connector.id}`;
}

function getAwsResourceId(element) {
  if (!element || element.isDeleted) return null;
  return element.customData?.awsResource?.awsResourceId || null;
}

function getBoundResourceId(connector, bindingKey, elementsById) {
  const binding = connector?.[bindingKey];
  if (!binding?.elementId) return null;
  return getAwsResourceId(elementsById.get(binding.elementId));
}

function buildRelationshipMetadata(connector, sourceResourceId, targetResourceId) {
  const existingType = connector.customData?.awsRelationship?.relationshipType;
  return {
    relationshipId: relationshipIdForConnector(connector),
    sourceResourceId,
    targetResourceId,
    relationshipType: AWS_RELATIONSHIP_TYPES.includes(existingType) ? existingType : AWS_RELATIONSHIP_TYPE,
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
      awsRelationship: relationship,
    },
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

function withoutRelationshipMetadata(element) {
  if (!element.customData?.awsRelationship) return element;
  const { awsRelationship: _removed, ...customData } = element.customData;
  return {
    ...element,
    customData,
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

/**
 * Synchronize AWS relationship metadata from normal Excalidraw connectors.
 *
 * A connector receives metadata only when both of its bindings resolve to
 * intelligent AWS resources. Relationship identity is tied to the connector
 * element ID, so moving or renaming either resource does not change it.
 *
 * Multiple explicit connectors between the same pair are allowed; each
 * connector has its own deterministic relationship ID. A single connector
 * never receives duplicate relationship metadata.
 */
export function syncAwsRelationshipMetadata(elements) {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const liveResourceIds = new Set(
    elements
      .filter((element) => !element.isDeleted)
      .map(getAwsResourceId)
      .filter(Boolean),
  );

  let changed = false;
  const nextElements = elements.map((element) => {
    if (!CONNECTOR_TYPES.has(element.type)) return element;

    const existingRelationship = element.customData?.awsRelationship;
    const sourceResourceId = getBoundResourceId(element, "startBinding", elementsById);
    const targetResourceId = getBoundResourceId(element, "endBinding", elementsById);

    if (sourceResourceId && targetResourceId) {
      const relationship = buildRelationshipMetadata(element, sourceResourceId, targetResourceId);
      if (sameRelationship(existingRelationship, relationship)) return element;
      changed = true;
      return withRelationshipMetadata(element, relationship);
    }

    // A relationship cannot remain attached to a connector once either
    // endpoint is no longer an intelligent AWS resource. This also prevents
    // dangling metadata after a referenced resource is deleted.
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

export function getAwsRelationship(element) {
  return element?.customData?.awsRelationship || null;
}


export function updateRelationshipType(elements, relationshipId, relationshipType) {
  if (!AWS_RELATIONSHIP_TYPES.includes(relationshipType)) {
    return { elements, changed: false };
  }

  let changed = false;
  const nextElements = elements.map((element) => {
    const relationship = element.customData?.awsRelationship;
    if (!relationship || relationship.relationshipId !== relationshipId || relationship.relationshipType === relationshipType) {
      return element;
    }

    changed = true;
    return withRelationshipMetadata(element, {
      ...relationship,
      relationshipType,
    });
  });

  return { elements: nextElements, changed };
}
