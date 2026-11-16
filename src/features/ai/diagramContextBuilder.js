const SCHEMA_VERSION = 1;
export const MAX_DIAGRAM_ELEMENTS = 1500;
export const MAX_DIAGRAM_CONTEXT_CHARS = 180_000;
const MAX_TEXT_LENGTH = 1500;
const MAX_PROPERTY_VALUE_LENGTH = 500;
const SECRET_KEY_PATTERN = /(secret|password|credential|token|api.?key|private.?key|session|cookie|auth)/i;

export class DiagramContextError extends Error {
  constructor(message) {
    super(message);
    this.name = "DiagramContextError";
  }
}

function safeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, maxLength);
}

function safeNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : undefined;
}

function safeProperties(input, depth = 0) {
  if (!input || typeof input !== "object" || depth > 2) return undefined;
  if (Array.isArray(input)) {
    return input.slice(0, 30).map((item) => {
      if (typeof item === "string") return safeText(item, MAX_PROPERTY_VALUE_LENGTH);
      if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
      return safeProperties(item, depth + 1);
    }).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, 80)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    const safeKey = safeText(key, 80);
    if (!safeKey) continue;
    if (typeof value === "string") output[safeKey] = safeText(value, MAX_PROPERTY_VALUE_LENGTH);
    else if (typeof value === "number" && Number.isFinite(value)) output[safeKey] = value;
    else if (typeof value === "boolean" || value === null) output[safeKey] = value;
    else if (depth < 2 && value && typeof value === "object") output[safeKey] = safeProperties(value, depth + 1);
  }
  return output;
}

function getResourceMetadata(element, includedResourceIds) {
  const custom = element?.customData || {};
  const candidates = [
    ["aws", custom.awsResource, custom.awsResource?.awsResourceId],
    ["kubernetes", custom.kubernetesResource, custom.kubernetesResource?.kubernetesResourceId],
    ["networking", custom.networkingResource, custom.networkingResource?.networkingResourceId],
  ];
  for (const [provider, resource, resourceId] of candidates) {
    if (!resource || typeof resource !== "object") continue;
    const dedupeKey = `${provider}:${safeText(resourceId || resource.definitionId || element.id, 200)}`;
    if (includedResourceIds.has(dedupeKey)) return undefined;
    includedResourceIds.add(dedupeKey);
    return {
      provider,
      resourceId: safeText(resourceId || "", 200),
      definitionId: safeText(resource.definitionId, 160),
      resourceType: safeText(resource.resourceType, 160),
      service: safeText(resource.service, 160),
      catalog: safeText(resource.catalog, 80),
      iconId: safeText(resource.iconId, 160),
      properties: safeProperties(resource.properties || {}),
    };
  }
  return undefined;
}

function resolveLabel(element, elementsById, textByContainer) {
  if (element.type === "text") return safeText(element.text);
  const textParts = (textByContainer.get(element.id) || []).map((text) => safeText(text.text, 800)).filter(Boolean);
  const direct = safeText(element.text || element.label?.text || "", 800);
  const names = [...new Set([direct, ...textParts].filter(Boolean))];
  if (names.length) return names.join(" / ").slice(0, MAX_TEXT_LENGTH);
  const metadata = element.customData || {};
  const resource = metadata.awsResource || metadata.kubernetesResource || metadata.networkingResource;
  if (typeof resource?.properties?.name === "string") return safeText(resource.properties.name, 800);
  if (typeof metadata.iconName === "string") return safeText(metadata.iconName, 800);
  return "";
}

function normalizeElement(element, elementsById, textByContainer, includedResourceIds) {
  const custom = element.customData || {};
  const record = {
    id: safeText(element.id, 200),
    type: safeText(element.type, 80),
    label: resolveLabel(element, elementsById, textByContainer),
  };
  const geometry = {
    x: safeNumber(element.x),
    y: safeNumber(element.y),
    width: safeNumber(element.width),
    height: safeNumber(element.height),
  };
  if (Object.values(geometry).some((value) => value !== undefined)) record.geometry = geometry;

  if (Array.isArray(element.groupIds) && element.groupIds.length) {
    record.groupIds = element.groupIds.filter((id) => typeof id === "string").slice(0, 20).map((id) => safeText(id, 160));
  }
  if (element.frameId) record.frameId = safeText(element.frameId, 160);
  if (element.type === "text" && element.containerId && elementsById.has(element.containerId)) {
    record.containerElementId = safeText(element.containerId, 200);
  }
  if (element.type === "arrow" || element.type === "line") {
    const startId = element.startBinding?.elementId;
    const endId = element.endBinding?.elementId;
    record.connector = {
      sourceElementId: typeof startId === "string" && elementsById.has(startId) ? safeText(startId, 200) : null,
      targetElementId: typeof endId === "string" && elementsById.has(endId) ? safeText(endId, 200) : null,
      relationshipExplicit: Boolean(startId && endId && elementsById.has(startId) && elementsById.has(endId)),
      startArrowhead: safeText(element.startArrowhead, 40),
      endArrowhead: safeText(element.endArrowhead, 40),
      label: safeText(resolveLabel(element, elementsById, textByContainer), 800),
    };
  }

  const relationship = custom.awsRelationship || custom.kubernetesRelationship || custom.networkingRelationship;
  if (relationship && typeof relationship === "object") {
    record.architectureRelationship = {
      provider: custom.awsRelationship ? "aws" : custom.kubernetesRelationship ? "kubernetes" : "networking",
      relationshipId: safeText(relationship.relationshipId, 200),
      relationshipType: safeText(relationship.relationshipType, 120),
      sourceResourceId: safeText(relationship.sourceResourceId, 200),
      targetResourceId: safeText(relationship.targetResourceId, 200),
    };
  }
  const resource = getResourceMetadata(element, includedResourceIds);
  if (resource) record.architectureResource = resource;

  if (custom.diagramIcon === true) record.diagramIcon = true;
  if (typeof custom.iconCategory === "string") record.iconCategory = safeText(custom.iconCategory, 120);
  if (typeof custom.iconSource === "string") record.iconSource = safeText(custom.iconSource, 80);
  return record;
}

/** Build a fresh, allow-listed representation from the current Excalidraw scene. */
export function buildDiagramContext(sceneElements) {
  if (!Array.isArray(sceneElements)) throw new DiagramContextError("The current diagram is not available. Please try again.");
  const liveElements = sceneElements.filter((element) => element && !element.isDeleted && typeof element.id === "string");
  if (liveElements.length > MAX_DIAGRAM_ELEMENTS) {
    throw new DiagramContextError(`This diagram has ${liveElements.length} elements. AI Ask currently supports up to ${MAX_DIAGRAM_ELEMENTS}; no elements were omitted.`);
  }

  const elementsById = new Map(liveElements.map((element) => [element.id, element]));
  const textByContainer = new Map();
  for (const element of liveElements) {
    if (element.type !== "text" || !element.containerId || !elementsById.has(element.containerId)) continue;
    const list = textByContainer.get(element.containerId) || [];
    list.push(element);
    textByContainer.set(element.containerId, list);
  }

  const includedResourceIds = new Set();
  const normalizedElements = liveElements.map((element) => normalizeElement(element, elementsById, textByContainer, includedResourceIds));
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    snapshotId: globalThis.crypto?.randomUUID?.() || `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    capturedAt: new Date().toISOString(),
    scope: "complete-current-canvas",
    elementCount: normalizedElements.length,
    elements: normalizedElements,
  };
  const encoded = JSON.stringify(snapshot);
  if (encoded.length > MAX_DIAGRAM_CONTEXT_CHARS) {
    throw new DiagramContextError(`The diagram context is too large (${encoded.length.toLocaleString()} characters). No diagram elements were omitted; reduce the diagram size and try again.`);
  }
  return snapshot;
}
