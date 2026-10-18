/** First Workbench vertical slice. IDs are stable public document-format values. */
export const WORKBENCH_VIEWS = [
  { id: "system", label: "System", description: "High-level component topology" },
  { id: "apis", label: "APIs", description: "Services and API contracts" },
  { id: "data", label: "Data", description: "Databases, queues and persistence" },
  { id: "deployment", label: "Deployment", description: "Runtime and deployment targets" },
];

export const WORKBENCH_COMPONENTS = [
  { kind: "frontend.react-app", label: "React application", group: "Application", details: "Browser UI and client workflows", fill: "#e8f2ff", stroke: "#3974c6", properties: [{ key: "basePath", label: "Base path", type: "text", defaultValue: "/" }, { key: "auth", label: "Authentication", type: "select", options: ["none", "session", "oauth2", "oidc"], defaultValue: "oidc" }] },
  { kind: "backend.rest-service", label: "REST service", group: "Application", details: "Backend service that exposes HTTP APIs", fill: "#e9f8ef", stroke: "#2c8b57", properties: [{ key: "basePath", label: "Base path", type: "text", defaultValue: "/api" }, { key: "port", label: "Port", type: "number", min: 1, max: 65535, defaultValue: 8080 }, { key: "apiVersion", label: "API version", type: "text", defaultValue: "1.0.0" }] },
  { kind: "backend.api-endpoint", label: "API endpoint", group: "Contracts", details: "Named HTTP operation on a service", fill: "#f0ebff", stroke: "#7955c8", properties: [{ key: "method", label: "HTTP method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], defaultValue: "GET" }, { key: "path", label: "Path", type: "text", defaultValue: "/api/resource" }, { key: "operationId", label: "Operation ID", type: "text", defaultValue: "getResource" }, { key: "summary", label: "Summary", type: "text", defaultValue: "" }, { key: "requestSchema", label: "Request JSON Schema", type: "json", defaultValue: "" }, { key: "responseSchema", label: "Response JSON Schema", type: "json", defaultValue: "" }] },
  { kind: "data.postgresql-database", label: "PostgreSQL", group: "Data", details: "Relational data store", fill: "#fff2dc", stroke: "#b7761e", properties: [{ key: "databaseName", label: "Database name", type: "text", defaultValue: "app_db" }, { key: "schema", label: "Schema", type: "text", defaultValue: "public" }] },
  { kind: "data.postgresql-table", label: "PostgreSQL table", group: "Data", details: "Table definition for validated SQL DDL generation", fill: "#fff5e5", stroke: "#a96b16", properties: [{ key: "tableName", label: "Table name", type: "text", defaultValue: "new_table" }, { key: "columns", label: "Columns (JSON)", type: "json", defaultValue: "[\n  { \"name\": \"id\", \"type\": \"UUID\", \"primaryKey\": true, \"nullable\": false },\n  { \"name\": \"created_at\", \"type\": \"TIMESTAMPTZ\", \"nullable\": false }\n]" }, { key: "indexes", label: "Indexes (JSON)", type: "json", defaultValue: "[]" }] },
  { kind: "messaging.queue", label: "Queue", group: "Data", details: "Asynchronous message boundary", fill: "#e2f7f5", stroke: "#19887d", properties: [{ key: "provider", label: "Provider", type: "select", options: ["RabbitMQ", "Kafka", "SQS", "Redis Streams"], defaultValue: "RabbitMQ" }, { key: "name", label: "Queue name", type: "text", defaultValue: "jobs" }] },
  { kind: "backend.worker", label: "Worker", group: "Application", details: "Background job processor", fill: "#fce9f0", stroke: "#b54473", properties: [{ key: "concurrency", label: "Concurrency", type: "number", min: 1, max: 1000, defaultValue: 4 }, { key: "retryLimit", label: "Retry limit", type: "number", min: 0, max: 100, defaultValue: 3 }] },
  { kind: "integrations.external-api", label: "External API", group: "Integrations", details: "Third-party service dependency", fill: "#f1f2f5", stroke: "#646b78", properties: [{ key: "baseUrl", label: "Base URL", type: "text", defaultValue: "https://api.example.com" }, { key: "auth", label: "Authentication", type: "select", options: ["none", "api-key", "oauth2", "mutual-tls"], defaultValue: "api-key" }] },
  { kind: "devops.deployment-target", label: "Deployment target", group: "Deployment", details: "Environment or runtime destination", fill: "#eaf4e2", stroke: "#5c8b35", properties: [{ key: "environment", label: "Environment", type: "select", options: ["development", "staging", "production"], defaultValue: "development" }, { key: "region", label: "Region", type: "text", defaultValue: "ap-south-1" }] },
];


/** Typed relation registry. Endpoint rules are intentionally explicit and testable. */
export const WORKBENCH_RELATIONS = [
  { kind: "calls", label: "Calls", description: "Sends a request to a service or API", sourceKinds: ["frontend.react-app", "backend.rest-service", "backend.worker"], targetKinds: ["backend.rest-service", "backend.api-endpoint", "integrations.external-api"] },
  { kind: "exposes", label: "Exposes API", description: "Service exposes an HTTP endpoint", sourceKinds: ["backend.rest-service"], targetKinds: ["backend.api-endpoint"] },
  { kind: "reads", label: "Reads from", description: "Reads data from a database", sourceKinds: ["backend.rest-service", "backend.worker"], targetKinds: ["data.postgresql-database"] },
  { kind: "contains-table", label: "Contains table", description: "Models a table inside a PostgreSQL schema", sourceKinds: ["data.postgresql-database"], targetKinds: ["data.postgresql-table"] },
  { kind: "writes", label: "Writes to", description: "Writes data to a database", sourceKinds: ["backend.rest-service", "backend.worker"], targetKinds: ["data.postgresql-database"] },
  { kind: "publishes", label: "Publishes to", description: "Publishes messages to a queue", sourceKinds: ["backend.rest-service", "backend.worker"], targetKinds: ["messaging.queue"] },
  { kind: "subscribes", label: "Subscribes to", description: "Consumes messages from a queue", sourceKinds: ["backend.worker"], targetKinds: ["messaging.queue"] },
  { kind: "deploys-to", label: "Deploys to", description: "Runs on a deployment target", sourceKinds: ["frontend.react-app", "backend.rest-service", "backend.worker"], targetKinds: ["devops.deployment-target"] },
  { kind: "authenticates-with", label: "Authenticates with", description: "Delegates or validates identity", sourceKinds: ["frontend.react-app", "backend.rest-service"], targetKinds: ["backend.rest-service", "integrations.external-api"] },
  { kind: "depends-on", label: "Depends on", description: "General dependency", sourceKinds: WORKBENCH_COMPONENTS.map(({ kind }) => kind), targetKinds: WORKBENCH_COMPONENTS.map(({ kind }) => kind) },
];
