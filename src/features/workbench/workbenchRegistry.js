/** First Workbench vertical slice. IDs are stable public document-format values. */
export const WORKBENCH_VIEWS = [
  { id: "system", label: "System", description: "High-level component topology" },
  { id: "apis", label: "APIs", description: "Services and API contracts" },
  { id: "data", label: "Data", description: "Databases, queues and persistence" },
  { id: "deployment", label: "Deployment", description: "Runtime and deployment targets" },
];

export const WORKBENCH_COMPONENTS = [
  { kind: "frontend.react-app", label: "React application", group: "Application", details: "Browser UI and client workflows", fill: "#e8f2ff", stroke: "#3974c6" },
  { kind: "backend.rest-service", label: "REST service", group: "Application", details: "Backend service that exposes HTTP APIs", fill: "#e9f8ef", stroke: "#2c8b57" },
  { kind: "backend.api-endpoint", label: "API endpoint", group: "Contracts", details: "Named HTTP operation on a service", fill: "#f0ebff", stroke: "#7955c8" },
  { kind: "data.postgresql-database", label: "PostgreSQL", group: "Data", details: "Relational data store", fill: "#fff2dc", stroke: "#b7761e" },
  { kind: "messaging.queue", label: "Queue", group: "Data", details: "Asynchronous message boundary", fill: "#e2f7f5", stroke: "#19887d" },
  { kind: "backend.worker", label: "Worker", group: "Application", details: "Background job processor", fill: "#fce9f0", stroke: "#b54473" },
  { kind: "integrations.external-api", label: "External API", group: "Integrations", details: "Third-party service dependency", fill: "#f1f2f5", stroke: "#646b78" },
  { kind: "devops.deployment-target", label: "Deployment target", group: "Deployment", details: "Environment or runtime destination", fill: "#eaf4e2", stroke: "#5c8b35" },
];
