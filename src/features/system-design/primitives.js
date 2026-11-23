// Curated catalog of 16 system design primitives in 4 categories.
// Pure data: no React, no Excalidraw, safe to import from node --test.

export const ACCENTS = ["slate", "emerald", "amber"];
export const PROTOCOLS = ["HTTPS", "gRPC", "RESP", "SQL", "Kafka"];
export const HEALTH_OVERRIDES = ["healthy", "degraded", "down"];

export const CATEGORIES = [
  { id: "edge", label: "Edge & Entry" },
  { id: "compute", label: "Compute & Services" },
  { id: "data", label: "Data & Caching" },
  { id: "messaging", label: "Messaging & Observability" },
];

// `entry: true` marks nodes that originate traffic when the simulator runs.
// `cache: true` marks nodes that shield downstream traffic using cacheHitRate.
// `terminal: true` marks sinks that never forward traffic.
const p = (def) => Object.freeze({
  cacheHitRate: 0,
  entry: false,
  cache: false,
  terminal: false,
  baseLatencyMs: 8,
  ...def,
});

export const PRIMITIVES = Object.freeze([
  // Edge & Entry
  p({ kind: "client", label: "Web/Mobile Client", category: "edge", accent: "slate", defaultProtocol: "HTTPS", replicas: 1, capacityPerReplica: 100000, port: 443, image: "n/a (browser/app)", subtitle: "Browser · iOS · Android", entry: true, baseLatencyMs: 2 }),
  p({ kind: "cdn", label: "CDN", category: "edge", accent: "emerald", defaultProtocol: "HTTPS", replicas: 1, capacityPerReplica: 200000, cacheHitRate: 0.85, port: 443, image: "cloudfront/edge-cache", subtitle: "Edge cache", entry: true, cache: true, baseLatencyMs: 12 }),
  p({ kind: "dns", label: "DNS / Route53", category: "edge", accent: "slate", defaultProtocol: "HTTPS", replicas: 2, capacityPerReplica: 100000, port: 53, image: "coredns/coredns:1.11.1", subtitle: "Name resolution", entry: true, baseLatencyMs: 4 }),
  p({ kind: "api-gateway", label: "API Gateway", category: "edge", accent: "slate", defaultProtocol: "HTTPS", replicas: 2, capacityPerReplica: 8000, port: 8080, image: "kong:3.6", subtitle: "Routing · rate limits", baseLatencyMs: 10 }),
  p({ kind: "load-balancer", label: "Load Balancer", category: "edge", accent: "slate", defaultProtocol: "HTTPS", replicas: 2, capacityPerReplica: 20000, port: 80, image: "nginx:1.27-alpine", subtitle: "L7 balancing", baseLatencyMs: 3 }),
  // Compute & Services
  p({ kind: "microservice", label: "Microservice", category: "compute", accent: "emerald", defaultProtocol: "gRPC", replicas: 3, capacityPerReplica: 1200, port: 8080, image: "ghcr.io/acme/service:latest", subtitle: "Business logic", baseLatencyMs: 25 }),
  p({ kind: "worker", label: "Worker / Cron", category: "compute", accent: "emerald", defaultProtocol: "Kafka", replicas: 2, capacityPerReplica: 600, port: 9090, image: "ghcr.io/acme/worker:latest", subtitle: "Async jobs", baseLatencyMs: 60 }),
  p({ kind: "serverless", label: "Serverless Function", category: "compute", accent: "amber", defaultProtocol: "HTTPS", replicas: 5, capacityPerReplica: 400, port: 8080, image: "public.ecr.aws/lambda/nodejs:20", subtitle: "Scale to zero", baseLatencyMs: 45 }),
  p({ kind: "auth", label: "Auth / IAM", category: "compute", accent: "amber", defaultProtocol: "HTTPS", replicas: 2, capacityPerReplica: 3000, port: 8443, image: "quay.io/keycloak/keycloak:25.0", subtitle: "Identity · tokens", baseLatencyMs: 18 }),
  // Data & Caching
  p({ kind: "sql", label: "SQL Database", category: "data", accent: "slate", defaultProtocol: "SQL", replicas: 2, capacityPerReplica: 1500, port: 5432, image: "postgres:16", subtitle: "Relational · primary + replica", terminal: true, baseLatencyMs: 14 }),
  p({ kind: "nosql", label: "NoSQL Store", category: "data", accent: "slate", defaultProtocol: "HTTPS", replicas: 3, capacityPerReplica: 4000, port: 27017, image: "mongo:7", subtitle: "Document store", terminal: true, baseLatencyMs: 9 }),
  p({ kind: "redis", label: "Redis Cache", category: "data", accent: "emerald", defaultProtocol: "RESP", replicas: 3, capacityPerReplica: 25000, cacheHitRate: 0.8, port: 6379, image: "redis:7-alpine", subtitle: "In-memory cache", cache: true, baseLatencyMs: 1 }),
  p({ kind: "object-storage", label: "Object Storage (S3)", category: "data", accent: "slate", defaultProtocol: "HTTPS", replicas: 1, capacityPerReplica: 5500, port: 9000, image: "minio/minio:latest", subtitle: "Blobs · static assets", terminal: true, baseLatencyMs: 35 }),
  p({ kind: "search", label: "Search Index", category: "data", accent: "amber", defaultProtocol: "HTTPS", replicas: 3, capacityPerReplica: 2500, port: 9200, image: "opensearchproject/opensearch:2.14.0", subtitle: "Full-text search", terminal: true, baseLatencyMs: 22 }),
  // Messaging & Observability
  p({ kind: "queue", label: "Message Queue / Kafka", category: "messaging", accent: "amber", defaultProtocol: "Kafka", replicas: 3, capacityPerReplica: 15000, port: 9092, image: "bitnami/kafka:3.7", subtitle: "Event backbone", baseLatencyMs: 5 }),
  p({ kind: "observability", label: "Metrics & Logging", category: "messaging", accent: "slate", defaultProtocol: "HTTPS", replicas: 1, capacityPerReplica: 20000, port: 9090, image: "prom/prometheus:v2.53.0", subtitle: "Prometheus · Loki", terminal: true, baseLatencyMs: 6 }),
]);

export const PRIMITIVES_BY_KIND = Object.freeze(Object.fromEntries(PRIMITIVES.map((item) => [item.kind, item])));

export function getPrimitive(kind) {
  return PRIMITIVES_BY_KIND[kind] || null;
}

export function primitivesByCategory() {
  return CATEGORIES.map((category) => ({
    ...category,
    items: PRIMITIVES.filter((item) => item.category === category.id),
  }));
}

/** 1–9 keyboard shortcut -> primitive (first nine in catalog order). */
export function getPrimitiveForShortcut(key) {
  const index = Number(key) - 1;
  return Number.isInteger(index) && index >= 0 && index < 9 ? PRIMITIVES[index] : null;
}

/** Fresh, serialisable node metadata for a primitive. */
export function createNodeMeta(kind, overrides = {}) {
  const primitive = getPrimitive(kind);
  if (!primitive) throw new Error(`Unknown system design primitive: ${kind}`);
  return {
    kind: primitive.kind,
    category: primitive.category,
    label: primitive.label,
    subtitle: primitive.subtitle,
    accent: primitive.accent,
    protocol: primitive.defaultProtocol,
    replicas: primitive.replicas,
    capacityPerReplica: primitive.capacityPerReplica,
    cacheHitRate: primitive.cacheHitRate,
    port: primitive.port,
    image: primitive.image,
    health: "healthy",
    ...overrides,
  };
}
