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
    id: "aws.webapp.three-tier",
    version: 1,
    name: "Three-Tier AWS Web Application",
    domain: "cloud-infrastructure",
    category: "AWS Architecture",
    description: "A starter AWS web application with an entry layer, compute tier, and relational data tier. This is a design starter, not a deployable infrastructure definition.",
    creationMode: "template",
    requiredRoles: ["client", "load-balancer", "compute", "database"],
    allowedRelationships: [["client", "load-balancer"], ["load-balancer", "compute"], ["compute", "database"]],
    initialElements: "aws-three-tier-webapp",
  },
  {
    id: "aws.serverless.api",
    version: 1,
    name: "Serverless API",
    domain: "cloud-infrastructure",
    category: "AWS Architecture",
    description: "A serverless API starter using API Gateway, AWS Lambda, and DynamoDB. This is a design starter, not a deployable infrastructure definition.",
    creationMode: "template",
    requiredRoles: ["api-gateway", "lambda", "dynamodb"],
    allowedRelationships: [["api-gateway", "lambda"], ["lambda", "dynamodb"]],
    initialElements: "aws-serverless-api",
  },
  {
    id: "aws.event-driven.processing",
    version: 1,
    name: "Event-Driven AWS Processing",
    domain: "cloud-infrastructure",
    category: "AWS Architecture",
    description: "An event-driven processing starter using EventBridge, SQS, Lambda, and DynamoDB. This is a design starter, not a deployable infrastructure definition.",
    creationMode: "template",
    requiredRoles: ["eventbridge", "sqs", "lambda", "dynamodb"],
    allowedRelationships: [["eventbridge", "sqs"], ["sqs", "lambda"], ["lambda", "dynamodb"]],
    initialElements: "aws-event-driven-processing",
  },
  {
    id: "aws.vpc.networking",
    version: 1,
    name: "AWS VPC and Networking",
    domain: "cloud-infrastructure",
    category: "AWS Architecture",
    description: "A network-focused AWS starter showing a VPC, public and private subnet boundaries, an internet gateway, load balancer, compute tier, and private database tier. This is a design starter, not a deployable infrastructure definition.",
    creationMode: "template",
    requiredRoles: ["client", "internet-gateway", "load-balancer", "compute", "database"],
    allowedRelationships: [["client", "internet-gateway"], ["internet-gateway", "load-balancer"], ["load-balancer", "compute"], ["compute", "database"]],
    initialElements: "aws-vpc-networking",
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
    id: "system-design.scalable-webapp",
    version: 1,
    name: "Scalable Web Application",
    domain: "software-architecture",
    category: "System design",
    description: "A scalable request path with edge delivery, load balancing, stateless application instances, caching, and persistent storage.",
    creationMode: "template",
    requiredRoles: ["client", "cdn", "load-balancer", "service", "cache", "database"],
    allowedRelationships: [["client", "cdn"], ["cdn", "load-balancer"], ["load-balancer", "service"], ["service", "cache"], ["cache", "database"]],
    initialElements: "system-scalable-webapp",
  },
  {
    id: "system-design.url-shortener",
    version: 1,
    name: "URL Shortener",
    domain: "software-architecture",
    category: "System design",
    description: "Model short-link creation and redirection through an API, key service, cache, and durable URL mapping store.",
    creationMode: "template",
    requiredRoles: ["client", "api", "key-service", "cache", "database"],
    allowedRelationships: [["client", "api"], ["api", "key-service"], ["key-service", "database"], ["api", "cache"], ["cache", "database"]],
    initialElements: "system-url-shortener",
  },
  {
    id: "system-design.media-processing",
    version: 1,
    name: "Media Upload and Processing",
    domain: "software-architecture",
    category: "System design",
    description: "Separate upload handling from asynchronous media processing using object storage, a queue, workers, and metadata storage.",
    creationMode: "template",
    requiredRoles: ["client", "api", "object-storage", "queue", "worker", "metadata-store"],
    allowedRelationships: [["client", "api"], ["api", "object-storage"], ["api", "queue"], ["queue", "worker"], ["worker", "object-storage"], ["worker", "metadata-store"]],
    initialElements: "system-media-processing",
  },
  {
    id: "system-design.microservices",
    version: 1,
    name: "Microservices Platform",
    domain: "software-architecture",
    category: "System design",
    description: "A gateway routes requests to independent services that own separate data stores, with asynchronous events for cross-service work.",
    creationMode: "template",
    requiredRoles: ["client", "gateway", "user-service", "order-service", "user-database", "order-database", "event-broker"],
    allowedRelationships: [["client", "gateway"], ["gateway", "user-service"], ["gateway", "order-service"], ["user-service", "user-database"], ["order-service", "order-database"], ["order-service", "event-broker"]],
    initialElements: "system-microservices",
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

export function createProfileForTemplate(templateId, { name, ruleMode = "guided", templateOptions = {} } = {}) {
  const template = getDesignTemplate(templateId);
  if (!template) throw new Error(`Unknown design template: ${String(templateId)}`);
  return createDesignProfile({
    name: name || template.name,
    domain: template.domain,
    creationMode: template.creationMode,
    templateId: template.id,
    templateVersion: template.version,
    ruleMode,
    templateOptions,
  });
}

export function getTemplateRulesForProfile(template, profile = null) {
  if (!template) return { requiredRoles: [], allowedRelationships: [] };
  if (template.id === "system-design.general" && profile?.templateOptions?.includeCache === true) {
    return {
      requiredRoles: [...(template.requiredRoles || []), "cache"],
      allowedRelationships: [["client", "service"], ["service", "cache"], ["cache", "database"]],
    };
  }
  return { requiredRoles: [...(template.requiredRoles || [])], allowedRelationships: [...(template.allowedRelationships || [])] };
}

export function createTemplateElements(templateId, options = {}) {
  const personal = listPersonalTemplates().find((template) => template.id === templateId);
  if (personal) return cloneTemplateElements(personal);
  const template = getDesignTemplate(templateId);
  if (!template || !template.initialElements || Array.isArray(template.initialElements)) return [];
  return createStarterElements(template.initialElements, options);
}
