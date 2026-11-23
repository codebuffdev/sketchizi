// One-click starter architectures. Pure data: node `key`s are local to a blueprint and `at` is a grid slot
// (column, row) that the loader turns into scene coordinates. Sizing is tuned so every blueprint is healthy at the
// default 10k req/s, which means the first thing a person sees after pressing Simulate is a working system.

export const BLUEPRINT_GRID = Object.freeze({ columnWidth: 300, rowHeight: 130 });

export const BLUEPRINTS = Object.freeze([
  {
    id: "read-heavy-web-scale",
    label: "Read-Heavy Web Scale",
    description: "CDN and Redis absorb reads so the database barely notices 10k req/s.",
    nodes: [
      { key: "client", kind: "client", at: [0, 0] },
      { key: "cdn", kind: "cdn", at: [1, 0] },
      { key: "lb", kind: "load-balancer", at: [2, 0] },
      { key: "api", kind: "microservice", at: [3, 0], overrides: { label: "Read API", replicas: 4 } },
      { key: "cache", kind: "redis", at: [4, 0] },
      { key: "db", kind: "sql", at: [5, 0], overrides: { label: "Primary DB" } },
    ],
    edges: [
      { from: "client", to: "cdn" },
      { from: "cdn", to: "lb" },
      { from: "lb", to: "api", protocol: "gRPC" },
      { from: "api", to: "cache", protocol: "RESP" },
      { from: "cache", to: "db", protocol: "SQL" },
    ],
  },
  {
    id: "event-driven-order-pipeline",
    label: "Event-Driven Order Pipeline",
    description: "Gateway to Kafka with two async workers that fan out the work.",
    nodes: [
      { key: "client", kind: "client", at: [0, 0.5] },
      { key: "gw", kind: "api-gateway", at: [1, 0.5] },
      { key: "orders", kind: "microservice", at: [2, 0.5], overrides: { label: "Order Service", replicas: 12 } },
      { key: "queue", kind: "queue", at: [3, 0.5], overrides: { label: "Order Events" } },
      { key: "fulfil", kind: "worker", at: [4, 0], overrides: { label: "Fulfillment Worker", replicas: 12 } },
      { key: "notify", kind: "worker", at: [4, 1], overrides: { label: "Notification Worker", replicas: 12 } },
      { key: "db", kind: "sql", at: [5, 0], overrides: { label: "Orders DB", capacityPerReplica: 4000 } },
      { key: "metrics", kind: "observability", at: [5, 1] },
    ],
    edges: [
      { from: "client", to: "gw" },
      { from: "gw", to: "orders", protocol: "gRPC" },
      { from: "orders", to: "queue", protocol: "Kafka" },
      { from: "queue", to: "fulfil", protocol: "Kafka" },
      { from: "queue", to: "notify", protocol: "Kafka" },
      { from: "fulfil", to: "db", protocol: "SQL" },
      { from: "notify", to: "metrics" },
    ],
  },
  {
    id: "load-balanced-microservices",
    label: "Load-Balanced Microservices",
    description: "One balancer splits traffic three ways, each service with its own store.",
    nodes: [
      { key: "client", kind: "client", at: [0, 1] },
      { key: "lb", kind: "load-balancer", at: [1, 1] },
      { key: "users", kind: "microservice", at: [2, 0], overrides: { label: "Users Service", replicas: 4 } },
      { key: "orders", kind: "microservice", at: [2, 1], overrides: { label: "Orders Service", replicas: 4 } },
      { key: "catalog", kind: "microservice", at: [2, 2], overrides: { label: "Catalog Service", replicas: 4 } },
      { key: "usersDb", kind: "sql", at: [3, 0], overrides: { label: "Users DB", replicas: 3, capacityPerReplica: 2000 } },
      { key: "ordersDb", kind: "sql", at: [3, 1], overrides: { label: "Orders DB", replicas: 3, capacityPerReplica: 2000 } },
      { key: "cache", kind: "redis", at: [3, 2], overrides: { label: "Catalog Cache" } },
    ],
    edges: [
      { from: "client", to: "lb" },
      { from: "lb", to: "users", protocol: "gRPC" },
      { from: "lb", to: "orders", protocol: "gRPC" },
      { from: "lb", to: "catalog", protocol: "gRPC" },
      { from: "users", to: "usersDb", protocol: "SQL" },
      { from: "orders", to: "ordersDb", protocol: "SQL" },
      { from: "catalog", to: "cache", protocol: "RESP" },
    ],
  },
]);

export function getBlueprint(id) {
  return BLUEPRINTS.find((blueprint) => blueprint.id === id) || null;
}

/** Scene-space size of a blueprint (for centring / placing it clear of existing content). */
export function blueprintExtent(blueprint, nodeSize) {
  const cols = Math.max(...blueprint.nodes.map((n) => n.at[0])) + 1;
  const rows = Math.max(...blueprint.nodes.map((n) => n.at[1])) + 1;
  return {
    width: (cols - 1) * BLUEPRINT_GRID.columnWidth + nodeSize.width,
    height: (rows - 1) * BLUEPRINT_GRID.rowHeight + nodeSize.height,
  };
}
