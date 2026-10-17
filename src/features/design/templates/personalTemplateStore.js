const STORAGE_KEY = "sketchizi-personal-templates-v1";
const FORMAT = "sketchizi-template";
const FORMAT_VERSION = 1;

function safeParse(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function listPersonalTemplates() {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY)).filter((item) =>
      item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.elements)
    ).map((item) => ({ ...item, creationMode: "template", isPersonal: true }));
  } catch { return []; }
}

export function savePersonalTemplate({ name, description = "", domain = "general", ruleMode = "guided", elements = [] }) {
  const cleanName = String(name || "").trim().slice(0, 120);
  if (!cleanName) throw new Error("Template name is required");
  if (!Array.isArray(elements) || elements.length > 10000) throw new Error("Template scene is invalid or too large");
  const existing = listPersonalTemplates();
  const template = {
    id: `personal.${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`,
    version: 1,
    name: cleanName,
    description: String(description || "Personal template").trim().slice(0, 500),
    domain: String(domain || "general"),
    category: "My templates",
    creationMode: "template",
    ruleMode: ruleMode === "strict" ? "strict" : "guided",
    requiredRoles: [],
    allowedRelationships: [],
    elements: structuredClone(elements),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPersonal: true,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, template])); }
  catch { throw new Error("Unable to save template. Browser storage may be full or unavailable."); }
  return template;
}

export function deletePersonalTemplate(templateId) {
  try {
    const next = listPersonalTemplates().filter((item) => item.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

export function exportPersonalTemplate(templateId) {
  const template = listPersonalTemplates().find((item) => item.id === templateId);
  if (!template) throw new Error("Personal template not found");
  return JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, template }, null, 2);
}

export function importPersonalTemplate(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("The selected file is not valid JSON"); }
  const source = parsed?.format === FORMAT && parsed?.formatVersion === FORMAT_VERSION ? parsed.template : null;
  if (!source || typeof source.name !== "string" || !Array.isArray(source.elements)) throw new Error("Unsupported or invalid Sketchizi template file");
  return savePersonalTemplate({ name: source.name, description: source.description, domain: source.domain, ruleMode: source.ruleMode, elements: source.elements });
}

export function cloneTemplateElements(template) {
  const source = Array.isArray(template?.elements) ? template.elements : [];
  const idMap = new Map(source.map((element) => [element.id, globalThis.crypto?.randomUUID?.() || `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`]));
  return structuredClone(source).map((element) => {
    element.id = idMap.get(element.id) || element.id;
    if (Array.isArray(element.boundElements)) element.boundElements = element.boundElements.map((binding) => ({ ...binding, id: idMap.get(binding.id) || binding.id }));
    if (element.containerId) element.containerId = idMap.get(element.containerId) || element.containerId;
    for (const key of ["startBinding", "endBinding"]) {
      if (element[key]?.elementId) element[key].elementId = idMap.get(element[key].elementId) || element[key].elementId;
    }
    if (Array.isArray(element.groupIds)) element.groupIds = element.groupIds.map((groupId) => idMap.get(groupId) || groupId);
    element.version = 1;
    element.versionNonce = Math.floor(Math.random() * 2147483647);
    return element;
  });
}

export function downloadPersonalTemplate(templateId) {
  const text = exportPersonalTemplate(templateId);
  const template = listPersonalTemplates().find((item) => item.id === templateId);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(template?.name || "sketchizi-template").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.sketchizi-template.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
