import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { getNetworkingResourceDefinitionForIcon, getNetworkingResourceDefinitionById, getNetworkingResourceDefaults, validateCidr } from "../../networkingResourceDefinitions.js";
import { networkingCanvasGlyph } from "./networkingIconArtwork.js";
export function createNetworkingResourceId() { return `networking-resource-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`; }
export function getSelectedNetworkingResource(elements = []) { return elements.find((e) => e?.customData?.networkingResource)?.customData.networkingResource || null; }
export function isIntelligentNetworkingResourceIcon(icon) { return Boolean(getNetworkingResourceDefinitionForIcon(icon)); }
export function insertNetworkingResource({ api, icon, x, y, markRecentlyUsed }) {
  const definition = getNetworkingResourceDefinitionForIcon(icon); if (!api || !definition) return false;
  const networkingResourceId = createNetworkingResourceId(); const properties = getNetworkingResourceDefaults(definition);
  const resource = { definitionId: definition.id, networkingResourceId, provider: "networking", service: "Networking", resourceType: definition.resourceType, iconId: definition.iconId, catalog: "networking", properties };
  const groupId = networkingResourceId;
  const raw = [
    { type: "rectangle", x, y, width: 280, height: 150, strokeColor: "#2563a6", backgroundColor: "#eef6ff", fillStyle: "solid", strokeWidth: 2, roughness: 0, roundness: { type: 3 }, groupIds: [groupId], customData: { diagramIcon: true, networkingResource: resource, networkingResourcePart: "container" } },
    { type: "text", x: x + 14, y: y + 4, width: 252, text: properties.name, fontSize: 18, fontFamily: 1, textAlign: "center", verticalAlign: "middle", strokeColor: "#16324f", backgroundColor: "transparent", autoResize: false, groupIds: [groupId], customData: { diagramIcon: true, networkingResource: resource, networkingResourcePart: "name" } },
    { type: "text", x: x + 14, y: y + 112, width: 252, text: "Networking resource", fontSize: 13, fontFamily: 1, textAlign: "center", verticalAlign: "middle", strokeColor: "#375a7f", backgroundColor: "transparent", autoResize: false, groupIds: [groupId], customData: { diagramIcon: true, networkingResource: resource, networkingResourcePart: "details" } },
    ...networkingCanvasGlyph(definition.resourceType, x, y + 28, groupId, resource),
  ];
  const inserted = restoreElements(convertToExcalidrawElements(raw), null, { deleteInvisibleElements: true }); const ids = inserted.map((e) => e.id);
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...inserted], appState: { ...api.getAppState(), selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  markRecentlyUsed?.(icon); return true;
}
export function updateNetworkingResource(api, resourceId, patch) {
  if (!api || !resourceId) return null; const elements = api.getSceneElementsIncludingDeleted();
  const found = elements.find((e) => e.customData?.networkingResource?.networkingResourceId === resourceId); if (!found) return null;
  const current = found.customData.networkingResource; const definition = getNetworkingResourceDefinitionById(current.definitionId); if (!definition) return null;
  const properties = { ...current.properties, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "cidr")) { const validation = validateCidr(properties.cidr); if (!validation.valid) return { error: validation.message }; }
  const nextResource = { ...current, properties };
  const details = definition.properties.filter((p) => p.key !== "name" && properties[p.key]).map((p) => `${p.label}: ${properties[p.key]}`).join(" · ") || "Networking resource";
  const next = elements.map((e) => { if (e.customData?.networkingResource?.networkingResourceId !== resourceId) return e; const customData = { ...e.customData, networkingResource: nextResource }; const text = e.customData.networkingResourcePart === "name" ? properties.name : e.customData.networkingResourcePart === "details" ? details : null; return { ...e, customData, ...(text !== null ? { text } : {}), version: (e.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }; });
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY }); return nextResource;
}
