import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { getAwsResourceDefinitionForIcon, getAwsResourceDefinitionById, getAwsResourceDefaults } from "../../awsResourceDefinitions";
import { logger } from "../../logging/logger";

function createResourceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `aws-resource-${crypto.randomUUID()}`;
  }
  return `aws-resource-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMetadata(definition, awsResourceId, properties) {
  return {
    definitionId: definition.id,
    awsResourceId,
    provider: definition.provider,
    service: definition.service,
    resourceType: definition.resourceType,
    iconId: definition.iconId,
    catalog: "aws-architecture",
    properties: { ...properties },
  };
}

function withResourceData(spec, resource, part) {
  return {
    ...spec,
    groupIds: [resource.awsResourceId],
    customData: {
      ...(spec.customData || {}),
      diagramIcon: true,
      awsResource: resource,
      awsResourcePart: part,
    },
  };
}

function textElement(x, y, width, text, resource, part, options = {}) {
  return withResourceData({
    type: "text",
    x,
    y,
    width,
    text,
    fontSize: options.fontSize || 14,
    fontFamily: 1,
    textAlign: options.textAlign || "left",
    verticalAlign: "middle",
    strokeColor: options.strokeColor || "#1e1e1e",
    backgroundColor: "transparent",
    autoResize: false,
  }, resource, part);
}

function resourceDetails(definition, properties) {
  return definition.properties
    .filter((property) => property.key !== "name")
    .map((property) => `${property.label}: ${properties[property.key] ?? property.defaultValue ?? ""}`)
    .join("\n");
}

function resourceVisualSize(definition) {
  const detailCount = definition.properties.filter((property) => property.key !== "name").length;
  return {
    width: 300,
    height: Math.max(154, 92 + (detailCount * 24)),
  };
}

export function getSelectedAwsResource(selectedElements = []) {
  const element = selectedElements.find((candidate) => candidate?.customData?.awsResource);
  return element?.customData?.awsResource || null;
}

export function isIntelligentAwsResourceIcon(icon) {
  return Boolean(getAwsResourceDefinitionForIcon(icon));
}

export async function insertAwsResource({ api, icon, x, y, markRecentlyUsed }) {
  const definition = getAwsResourceDefinitionForIcon(icon);
  if (!definition || !api) return false;

  const properties = getAwsResourceDefaults(definition);
  const awsResourceId = createResourceId();
  const resource = createMetadata(definition, awsResourceId, properties);
  const { width, height } = resourceVisualSize(definition);
  const iconSize = 64;
  const fileId = `${awsResourceId}-icon`;

  try {
    const response = await fetch(icon.src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`AWS icon request failed (${response.status})`);
    const svg = await response.text();
    const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

    api.addFiles([{
      id: fileId,
      dataURL,
      mimeType: "image/svg+xml",
      created: Date.now(),
      lastRetrieved: Date.now(),
    }]);

    const rawElements = [
      withResourceData({
        type: "rectangle",
        x,
        y,
        width,
        height,
        strokeColor: "#d0d0d0",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        roundness: { type: 3 },
      }, resource, "container"),
      withResourceData({
        type: "image",
        x: x + 18,
        y: y + 20,
        width: iconSize,
        height: iconSize,
        fileId,
      }, resource, "icon"),
      textElement(x + 96, y + 18, width - 114, properties.name, resource, "name", { fontSize: 19 }),
      textElement(x + 96, y + 54, width - 114, resourceDetails(definition, properties), resource, "details", { fontSize: 13 }),
    ];

    const elements = restoreElements(convertToExcalidrawElements(rawElements), null, {
      deleteInvisibleElements: true,
    });
    const previousElements = api.getSceneElementsIncludingDeleted();
    const nextElements = [...previousElements, ...elements];
    const ids = elements.map((element) => element.id);

    api.updateScene({
      elements: nextElements,
      appState: {
        ...api.getAppState(),
        selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    markRecentlyUsed(icon);
    return true;
  } catch (error) {
    logger.error("Could not create AWS intelligent resource", error, {
      category: "canvas",
      operation: "aws-resource-insert",
      resourceDefinition: definition.id,
      iconId: icon.id,
    });
    return false;
  }
}

export function updateAwsResource(api, awsResourceId, patch) {
  if (!api || !awsResourceId) return null;

  const elements = api.getSceneElementsIncludingDeleted();
  const resourceElement = elements.find(
    (element) => element.customData?.awsResource?.awsResourceId === awsResourceId,
  );
  if (!resourceElement) return null;

  const currentResource = resourceElement.customData.awsResource;
  const definition = getAwsResourceDefinitionById(currentResource.definitionId);
  if (!definition) return null;

  const properties = { ...currentResource.properties, ...patch };
  const nextResource = { ...currentResource, properties };

  const nextElements = elements.map((element) => {
    if (element.customData?.awsResource?.awsResourceId !== awsResourceId) return element;

    const nextCustomData = {
      ...(element.customData || {}),
      awsResource: nextResource,
    };
    let next = {
      ...element,
      customData: nextCustomData,
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    };

    if (next.customData.awsResourcePart === "name" && next.type === "text") {
      next = { ...next, text: properties.name };
    }
    if (next.customData.awsResourcePart === "details" && next.type === "text") {
      next = { ...next, text: resourceDetails(definition, properties) };
    }
    return next;
  });

  api.updateScene({
    elements: nextElements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return nextResource;
}
