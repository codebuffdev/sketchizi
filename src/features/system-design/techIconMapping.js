const TECHNOLOGY_QUERIES = [
  [["redis"], "redis"],
  [["kafka", "pubsub", "pub sub", "event bus", "message queue"], "kafka"],
  [["postgres", "postgresql"], "postgres"],
  [["mongo", "mongodb", "document database", "nosql"], "mongodb"],
  [["nginx"], "nginx"],
  [["s3", "object storage", "bucket"], "s3"],
  [["clickhouse"], "clickhouse"],
  [["twilio", "sms"], "twilio"],
  [["stripe", "payment", "psp"], "stripe"],
  [["docker", "container"], "docker"],
  [["aws", "amazon web services"], "aws"],
];

const KIND_QUERIES = {
  redis: "redis",
  queue: "kafka",
  pubsub: "kafka",
  sql: "postgres",
  nosql: "mongodb",
  "object-storage": "s3",
  "external-api": "stripe",
  "load-balancer": "nginx",
};

/** Best-effort search hint for the existing Icon Library; never silently assigns a brand icon. */
export function inferTechnologyIconQuery(label, kind) {
  const text = String(label || "").trim();
  const normalized = text.toLowerCase();
  for (const [terms, query] of TECHNOLOGY_QUERIES) {
    if (terms.some((term) => normalized.includes(term))) return query;
  }
  return KIND_QUERIES[kind] || text.split(" ").filter(Boolean).slice(0, 2).join(" ");
}

/** Keep only serializable catalog fields; no React elements or runtime-only catalog objects enter the scene. */
export function toCustomNodeIcon(icon) {
  if (!icon || typeof icon !== "object" || !icon.id || !icon.name || !icon.src) return null;
  return {
    id: String(icon.id),
    name: String(icon.name),
    src: String(icon.src),
    ...(icon.source ? { source: String(icon.source) } : {}),
    ...(icon.category ? { category: String(icon.category) } : {}),
    ...(icon.svgPath || icon.path ? { svgPath: String(icon.svgPath || icon.path) } : {}),
  };
}
