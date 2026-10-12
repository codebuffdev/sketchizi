import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { applyKubernetesResourcePatch, getKubernetesResourceDefinitionById, getKubernetesResourceDefinitionForIcon, getKubernetesResourceDefaults } from "../../kubernetesResourceDefinitions";
import { logger } from "../../logging/logger";

export function createKubernetesResourceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `kubernetes-resource-${crypto.randomUUID()}`;
  }
  return `kubernetes-resource-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMetadata(definition, kubernetesResourceId, properties) {
  return {
    definitionId: definition.id,
    kubernetesResourceId,
    provider: definition.provider,
    resourceType: definition.resourceType,
    iconId: definition.iconId,
    catalog: "kubernetes",
    properties: { ...properties },
  };
}

function withResourceData(spec, resource, part) {
  return {
    ...spec,
    groupIds: [resource.kubernetesResourceId],
    customData: {
      ...(spec.customData || {}),
      diagramIcon: true,
      kubernetesResource: resource,
      kubernetesResourcePart: part,
    },
  };
}

function resourceDetails(definition, properties) {
  return definition.properties
    .filter((property) => property.key !== "name")
    .map((property) => `${property.label}: ${properties[property.key] ?? property.defaultValue ?? ""}`)
    .join("\n");
}

function textElement(x, y, width, text, resource, part, options = {}) {
  return withResourceData({
    type: "text", x, y, width, text,
    fontSize: options.fontSize || 14,
    fontFamily: 1,
    textAlign: options.textAlign || "left",
    verticalAlign: "middle",
    strokeColor: options.strokeColor || "#1e1e1e",
    backgroundColor: "transparent",
    autoResize: false,
  }, resource, part);
}

export function getSelectedKubernetesResource(selectedElements = []) {
  const element = selectedElements.find((candidate) => candidate?.customData?.kubernetesResource);
  return element?.customData?.kubernetesResource || null;
}

export function isIntelligentKubernetesResourceIcon(icon) {
  return Boolean(getKubernetesResourceDefinitionForIcon(icon));
}

export async function insertKubernetesResource({ api, icon, x, y, markRecentlyUsed }) {
  const definition = getKubernetesResourceDefinitionForIcon(icon);
  if (!definition || !api) return false;

  const properties = getKubernetesResourceDefaults(definition);
  const kubernetesResourceId = createKubernetesResourceId();
  const resource = createMetadata(definition, kubernetesResourceId, properties);
  const width = 300;
  const detailCount = definition.properties.filter((property) => property.key !== "name").length;
  const height = Math.max(154, 92 + detailCount * 24);
  const iconSize = 64;
  const fileId = `${kubernetesResourceId}-icon`;

  try {
    const response = await fetch(icon.src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Kubernetes icon request failed (${response.status})`);
    const svg = await response.text();
    const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

    api.addFiles([{ id: fileId, dataURL, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now() }]);

    const rawElements = [
      withResourceData({
        type: "rectangle", x, y, width, height,
        strokeColor: "#d0d0d0", backgroundColor: "#ffffff", fillStyle: "solid",
        strokeWidth: 1, roughness: 0, roundness: { type: 3 },
      }, resource, "container"),
      withResourceData({ type: "image", x: x + 18, y: y + 20, width: iconSize, height: iconSize, fileId }, resource, "icon"),
      textElement(x + 96, y + 18, width - 114, properties.name, resource, "name", { fontSize: 19 }),
      textElement(x + 96, y + 54, width - 114, resourceDetails(definition, properties), resource, "details", { fontSize: 13 }),
    ];

    const elements = restoreElements(convertToExcalidrawElements(rawElements), null, { deleteInvisibleElements: true });
    const previousElements = api.getSceneElementsIncludingDeleted();
    const nextElements = [...previousElements, ...elements];
    const ids = elements.map((element) => element.id);

    api.updateScene({
      elements: nextElements,
      appState: { ...api.getAppState(), selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    markRecentlyUsed(icon);
    return true;
  } catch (error) {
    logger.error("Could not create Kubernetes intelligent resource", error, {
      category: "canvas", operation: "kubernetes-resource-insert", resourceDefinition: definition.id, iconId: icon.id,
    });
    return false;
  }
}

export function updateKubernetesResource(api, kubernetesResourceId, patch) {
  if (!api || !kubernetesResourceId) return null;
  const elements = api.getSceneElementsIncludingDeleted();
  const resourceElement = elements.find((element) => element.customData?.kubernetesResource?.kubernetesResourceId === kubernetesResourceId);
  if (!resourceElement) return null;

  const currentResource = resourceElement.customData.kubernetesResource;
  const definition = getKubernetesResourceDefinitionById(currentResource.definitionId);
  if (!definition) return null;

  const nextResource = applyKubernetesResourcePatch(currentResource, patch);
  if (!nextResource) return null;
  const properties = nextResource.properties;
  const nextElements = elements.map((element) => {
    if (element.customData?.kubernetesResource?.kubernetesResourceId !== kubernetesResourceId) return element;
    let next = {
      ...element,
      customData: { ...(element.customData || {}), kubernetesResource: nextResource },
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    };
    if (next.customData.kubernetesResourcePart === "name" && next.type === "text") next = { ...next, text: properties.name };
    if (next.customData.kubernetesResourcePart === "details" && next.type === "text") next = { ...next, text: resourceDetails(definition, properties) };
    return next;
  });

  api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return nextResource;
}
