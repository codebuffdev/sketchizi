const TECHNOLOGY_QUERIES = [
  [/\\bredis\\b/i, "redis"],
  [/\\b(kafka|pub\\s*sub|event bus|message queue)\\b/i, "kafka"],
  [/\\b(postgres(?:ql)?|postgres database)\\b/i, "postgres"],
  [/\\b(mongo(?:db)?|document database|nosql)\\b/i, "mongodb"],
  [/\\bnginx\\b/i, "nginx"],
  [/\\b(s3|object storage|bucket)\\b/i, "s3"],
  [/\\bclickhouse\\b/i, "clickhouse"],
  [/\\b(twilio|sms)\\b/i, "twilio"],
  [/\\b(stripe|payment|psp)\\b/i, "stripe"],
  [/\\b(docker|container)\\b/i, "docker"],
  [/\\b(aws|amazon web services)\\b/i, "aws"],
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
  const text = String(label || "");
  for (const [pattern, query] of TECHNOLOGY_QUERIES) {
    if (pattern.test(text)) return query;
  }
  return KIND_QUERIES[kind] || text.trim().split(/\\s+/).slice(0, 2).join(" ");
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
