/** Deterministic, reviewable starter proposal. This is heuristic guidance, not AI inference. */
export function proposeArchitectureFromRequirement(requirement) {
  const text = String(requirement || "").trim();
  if (text.length < 12) return { valid: false, message: "Describe the system in at least 12 characters so the proposal has useful context.", components: [], assumptions: [] };
  const normalized = text.toLowerCase();
  const components = [
    { kind: "frontend.react-app", name: "Web application", reason: "Provides the user-facing entry point.", selected: true },
    { kind: "backend.rest-service", name: "Core API service", reason: "Owns request handling and application workflows.", selected: true },
    { kind: "data.postgresql-database", name: "Application database", reason: "Stores durable relational application state.", selected: true },
  ];
  if (/payment|checkout|billing|invoice/.test(normalized)) components.push({ kind: "integrations.external-api", name: "Payment provider integration", reason: "Represents the external payment boundary; provider and authentication must be chosen.", selected: true });
  if (/asynchronous|async|event|queue|background|notification|email/.test(normalized)) {
    components.push({ kind: "messaging.queue", name: "Event queue", reason: "Separates asynchronous work from the request path.", selected: true });
    components.push({ kind: "backend.worker", name: "Background worker", reason: "Consumes queued work and performs retryable processing.", selected: true });
  }
  if (/mobile|ios|android/.test(normalized)) components.push({ kind: "integrations.external-api", name: "Mobile client API boundary", reason: "The mobile client needs a stable API contract; model the client technology explicitly.", selected: true });
  if (/deploy|kubernetes|cloud|production|availability|region/.test(normalized)) components.push({ kind: "devops.deployment-target", name: "Deployment environment", reason: "Makes the deployment target explicit; region and runtime remain to be decided.", selected: true });
  const byKind = (kind) => components.find((component) => component.kind === kind);
  const relations = [];
  const web = byKind("frontend.react-app");
  const api = byKind("backend.rest-service");
  const database = byKind("data.postgresql-database");
  const payment = components.find((component) => component.name === "Payment provider integration");
  const queue = byKind("messaging.queue");
  const worker = byKind("backend.worker");
  if (web && api) relations.push({ source: web.name, sourceKind: web.kind, kind: "calls", target: api.name, targetKind: api.kind, reason: "The client sends requests to the API service." });
  if (api && database) relations.push({ source: api.name, sourceKind: api.kind, kind: "reads", target: database.name, targetKind: database.kind, reason: "The service reads durable application state." });
  if (api && payment) relations.push({ source: api.name, sourceKind: api.kind, kind: "calls", target: payment.name, targetKind: payment.kind, reason: "The service integrates with the external payment boundary." });
  if (api && queue) relations.push({ source: api.name, sourceKind: api.kind, kind: "publishes", target: queue.name, targetKind: queue.kind, reason: "The service publishes work for asynchronous processing." });
  if (worker && queue) relations.push({ source: worker.name, sourceKind: worker.kind, kind: "subscribes", target: queue.name, targetKind: queue.kind, reason: "The worker consumes queued work." });
  const assumptions = [
    "The web client and REST API are a starting architecture, not a claim that this is the only suitable design.",
    "PostgreSQL is proposed as a relational store; data volume, consistency, and access patterns have not been assessed.",
    "Security, identity, scaling, availability, observability, and recovery requirements need explicit review.",
    "The proposal does not infer service boundaries, APIs, tables, capacity, or deployment topology from the brief.",
  ];
  if (/payment|checkout|billing|invoice/.test(normalized)) assumptions.push("Payment-provider choice, idempotency, reconciliation, and failure handling are unresolved.");
  if (/asynchronous|async|event|queue|background|notification|email/.test(normalized)) assumptions.push("Queue delivery semantics, ordering, retries, dead-letter handling, and idempotency are unresolved.");
  return { valid: true, requirement: text, components, relations, assumptions, notice: "Heuristic starter proposal. Review each component and assumption; nothing is added to the model until you choose it." };
}
