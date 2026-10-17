import { createDesignProfile } from "../model/designDocument.js";
import { createStarterElements } from "./templateScene.js";
import { listPersonalTemplates, cloneTemplateElements } from "./personalTemplateStore.js";

export const BUILT_IN_TEMPLATES = Object.freeze([
  {
    id: "general.blank",
    version: 1,
    name: "Blank canvas",
    domain: "general",
    category: "Freeform",
    description: "Start from an empty canvas. Add any kind of design without template constraints.",
    creationMode: "blank",
    requiredRoles: [],
    allowedRelationships: [],
    initialElements: [],
  },
  {
    id: "system-design.general",
    version: 1,
    name: "System architecture",
    domain: "software-architecture",
    category: "Architecture",
    description: "A starter client → service → database architecture. Extend it with caches, queues, gateways, and other components.",
    creationMode: "template",
    requiredRoles: ["client", "service", "database"],
    allowedRelationships: [["client", "service"], ["service", "database"]],
    initialElements: "system-architecture",
  },
  {
    id: "flow.process-basic",
    version: 1,
    name: "Process flow",
    domain: "process-flow",
    category: "Flowcharts",
    description: "A starter Start → Task → End flow for process design and later simulation.",
    creationMode: "template",
    requiredRoles: ["start", "task", "end"],
    allowedRelationships: [["start", "task"], ["task", "end"]],
    initialElements: "process-flow",
  },
  {
    id: "database.erd-basic",
    version: 1,
    name: "Database / ERD",
    domain: "database",
    category: "Data design",
    description: "Start with two related entity boxes and refine them into your data model.",
    creationMode: "template",
    requiredRoles: ["entity", "entity"],
    allowedRelationships: [["entity", "entity"]],
    initialElements: "database-erd",
  },
  {
    id: "pattern.layered-architecture",
    version: 1,
    name: "Layered architecture",
    domain: "software-architecture",
    category: "Design patterns",
    description: "Separate presentation, application, domain, and infrastructure responsibilities.",
    creationMode: "pattern",
    requiredRoles: ["presentation", "application", "domain", "infrastructure"],
    allowedRelationships: [["presentation", "application"], ["application", "domain"], ["domain", "infrastructure"]],
    initialElements: "layered-architecture",
  },
  {
    id: "pattern.event-driven",
    version: 1,
    name: "Event-driven architecture",
    domain: "software-architecture",
    category: "Design patterns",
    description: "Model a producer publishing events to a queue or broker consumed by downstream workers.",
    creationMode: "pattern",
    requiredRoles: ["producer", "queue", "consumer"],
    allowedRelationships: [["producer", "queue"], ["queue", "consumer"]],
    initialElements: "event-driven",
  },
]);

export function listDesignTemplates() {
  const builtIns = BUILT_IN_TEMPLATES.map(({ initialElements, ...template }) => ({ ...template }));
  return [...builtIns, ...listPersonalTemplates().map(({ elements, ...template }) => ({ ...template }))];
}

export function getDesignTemplate(templateId) {
  return BUILT_IN_TEMPLATES.find((template) => template.id === templateId)
    || listPersonalTemplates().find((template) => template.id === templateId)
    || null;
}

export function createProfileForTemplate(templateId, { name, ruleMode = "guided" } = {}) {
  const template = getDesignTemplate(templateId);
  if (!template) throw new Error(`Unknown design template: ${String(templateId)}`);
  return createDesignProfile({
    name: name || template.name,
    domain: template.domain,
    creationMode: template.creationMode,
    templateId: template.id,
    templateVersion: template.version,
    ruleMode,
  });
}

export function createTemplateElements(templateId) {
  const personal = listPersonalTemplates().find((template) => template.id === templateId);
  if (personal) return cloneTemplateElements(personal);
  const template = getDesignTemplate(templateId);
  if (!template || !template.initialElements || Array.isArray(template.initialElements)) return [];
  return createStarterElements(template.initialElements);
}
