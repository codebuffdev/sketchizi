// One-click starter architectures. Pure data: node `key`s are local to a blueprint and `at` is a grid slot
// (column, row) that the loader turns into scene coordinates. Sizing is tuned so every blueprint is healthy at the
// default 10k req/s, which means the first thing a person sees after pressing Simulate is a working system.

export const BLUEPRINT_GRID = Object.freeze({ columnWidth: 300, rowHeight: 130 });

const CORE_BLUEPRINTS = [
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
];

const alexNode = (key, kind, x, y, label, overrides = {}) => ({
  key, kind, x, y, width: 204, height: 88,
  overrides: { ...(label ? { label } : {}), ...overrides },
});
const alexEdge = (fromNode, toNode, protocol = "HTTPS", fromPort = "right", toPort = "left") => ({
  id: `${fromNode}-${toNode}`, fromNode, fromPort, toNode, toPort, protocol,
});
const alexBlueprint = (id, label, chapter, description, nodes, edges) => ({
  id, label, category: "Alex Xu · System Design", chapter, description, nodes, edges,
});

const ALEX_XU_BLUEPRINTS = [
  alexBlueprint("url-shortener-tinyurl", "URL Shortener (TinyURL)", "Vol. 1 · Ch. 8",
    "Redirect path optimized with a high-hit-rate Redis cache and durable URL mappings.",
    [
      alexNode("client","client",0,140), alexNode("lb","load-balancer",300,140),
      alexNode("api","microservice",600,140,"Shortener API",{replicas:8,capacityPerReplica:8000}),
      alexNode("cache","redis",900,0,"Redis Cache",{cacheHitRate:0.85,replicas:3}),
      alexNode("store","nosql",900,280,"URL Mappings",{replicas:4,capacityPerReplica:8000}),
    ], [alexEdge("client","lb"),alexEdge("lb","api","gRPC"),alexEdge("api","cache","RESP"),alexEdge("api","store","HTTPS")]),
  alexBlueprint("distributed-rate-limiter", "Distributed Rate Limiter", "Vol. 1 · Ch. 4",
    "Gateway enforces a distributed token bucket before forwarding requests to core services.",
    [
      alexNode("client","client",0,140),alexNode("gateway","api-gateway",300,140,"Rate Limiter",{replicas:4,capacityPerReplica:12000}),
      alexNode("redis","redis",600,0,"Token Bucket"),alexNode("api","microservice",600,280,"Core API",{replicas:8,capacityPerReplica:10000}),
      alexNode("sql","sql",900,280,"Rate Limit Policies",{replicas:3}),
    ],[alexEdge("client","gateway"),alexEdge("gateway","redis","RESP"),alexEdge("gateway","api","gRPC"),alexEdge("api","sql","SQL")]),
  alexBlueprint("news-feed-twitter-fanout", "News Feed (Twitter Fan-out)", "Vol. 1 · Ch. 11",
    "Post writes fan out asynchronously while feed reads use a dedicated timeline cache.",
    [
      alexNode("client","client",0,140),alexNode("lb","load-balancer",300,140),
      alexNode("post","microservice",600,0,"Post Service",{replicas:8}),alexNode("feed","microservice",600,280,"Feed Service",{replicas:12}),
      alexNode("bus","pubsub",900,0,"Fan-out Bus"),alexNode("worker","worker",1200,0,"Fanout Worker",{replicas:16,capacityPerReplica:3000}),
      alexNode("cache","redis",1500,0,"Timeline Cache"),alexNode("posts","sql",900,280,"Posts DB",{replicas:4}),
      alexNode("cdn","cdn",1500,280,"Media CDN"),
    ],[alexEdge("client","lb"),alexEdge("lb","post","gRPC"),alexEdge("lb","feed","gRPC"),alexEdge("post","bus","Kafka"),alexEdge("feed","bus","Kafka"),alexEdge("bus","worker","Kafka"),alexEdge("worker","cache","RESP"),alexEdge("worker","posts","SQL"),alexEdge("worker","cdn")]),
  alexBlueprint("notification-system", "Notification System", "Vol. 1 · Ch. 10",
    "A durable notification queue fans out to independent push and email/SMS delivery workers.",
    [
      alexNode("client","client",0,140),alexNode("gateway","api-gateway",300,140),
      alexNode("service","microservice",600,140,"Notification Service",{replicas:8}),
      alexNode("queue","queue",900,140,"Push & SMS Topics"),
      alexNode("push","worker",1200,0,"APNs/FCM Worker",{replicas:8,capacityPerReplica:1000}),alexNode("email","worker",1200,280,"Twilio/Email Worker",{replicas:8,capacityPerReplica:1000}),
      alexNode("provider","external-api",1500,0,"APNs / Twilio",{capacityPerReplica:20000}),alexNode("log","nosql",1500,280,"Notification Log"),
    ],[alexEdge("client","gateway"),alexEdge("gateway","service","gRPC"),alexEdge("service","queue","Kafka"),alexEdge("queue","push","Kafka"),alexEdge("queue","email","Kafka"),alexEdge("push","provider"),alexEdge("email","provider"),alexEdge("push","log","HTTPS"),alexEdge("email","log","HTTPS")]),
  alexBlueprint("realtime-chat-whatsapp", "Real-Time Chat (WhatsApp)", "Vol. 1 · Ch. 12",
    "WebSocket ingress separates chat delivery from presence and online-state tracking.",
    [
      alexNode("client","client",0,140),alexNode("ws","websocket-gateway",300,140),
      alexNode("chat","microservice",600,0,"Chat Service",{replicas:12}),alexNode("presence","microservice",600,280,"Presence Service",{replicas:8}),
      alexNode("bus","pubsub",900,0,"Chat Relay"),alexNode("redis","redis",900,280,"Online Status"),
      alexNode("store","nosql",1200,0,"Message Store",{replicas:6}),
    ],[alexEdge("client","ws"),alexEdge("ws","chat","gRPC"),alexEdge("ws","presence","gRPC"),alexEdge("chat","bus","Kafka"),alexEdge("bus","store","HTTPS"),alexEdge("chat","store","HTTPS"),alexEdge("presence","redis","RESP"),alexEdge("chat","redis","RESP")]),
  alexBlueprint("video-streaming-youtube", "Video Streaming (YouTube)", "Vol. 1 · Ch. 14",
    "Upload metadata and blobs flow through asynchronous transcoding to edge delivery.",
    [
      alexNode("client","client",0,140),alexNode("cdn","cdn",300,0,"Edge Video Stream"),
      alexNode("gateway","api-gateway",300,280),alexNode("api","microservice",600,280,"Upload & Stream API",{replicas:8}),
      alexNode("storage","object-storage",900,0,"Raw & Encoded Blob"),alexNode("queue","queue",900,280,"Transcode Queue"),
      alexNode("transcoder","stream-processor",1200,280,"DAG Transcoder",{replicas:6}),alexNode("sql","sql",1500,280,"Video Metadata",{replicas:3}),
    ],[alexEdge("client","cdn"),alexEdge("client","gateway"),alexEdge("gateway","api","gRPC"),alexEdge("api","storage"),alexEdge("api","queue","Kafka"),alexEdge("queue","transcoder","Kafka"),alexEdge("transcoder","storage"),alexEdge("api","sql","SQL")]),
  alexBlueprint("distributed-web-crawler", "Distributed Web Crawler", "Vol. 1 · Ch. 9",
    "A durable URL frontier dispatches crawler workers to fetch, store, deduplicate and index pages.",
    [
      alexNode("client","client",0,140,"Seed URLs"),alexNode("frontier","queue",300,140,"URL Frontier"),
      alexNode("workers","worker",600,140,"Crawler Workers",{replicas:20,capacityPerReplica:2000}),
      alexNode("hosts","external-api",900,0,"Target Web Hosts",{capacityPerReplica:4000}),
      alexNode("html","object-storage",900,140,"Raw HTML Store"),alexNode("index","search",1200,0,"Inverted Index"),
      alexNode("dedup","redis",1200,280,"URL Dedup Set"),
    ],[alexEdge("client","frontier"),alexEdge("frontier","workers","Kafka"),alexEdge("workers","hosts"),alexEdge("workers","html"),alexEdge("workers","index"),alexEdge("workers","dedup","RESP")]),
  alexBlueprint("nearby-friends-geohash", "Nearby Friends (Geohash)", "Vol. 2 · Ch. 1 & 2",
    "Live location updates are published to geospatial cache and persisted for durable and read-scaled queries.",
    [
      alexNode("client","client",0,140),alexNode("ws","websocket-gateway",300,140),
      alexNode("service","microservice",600,140,"Location Service",{replicas:10}),
      alexNode("redis","redis",900,0,"Geohash + PubSub"),alexNode("sql","sql",900,140,"User Location Primary",{replicas:4}),
      alexNode("replica","read-replica",1200,140,"Geo Read Replica",{replicas:3}),
    ],[alexEdge("client","ws"),alexEdge("ws","service","gRPC"),alexEdge("service","redis","RESP"),alexEdge("service","sql","SQL"),alexEdge("sql","replica","SQL")]),
  alexBlueprint("payment-system-ledger-psp", "Payment System (Ledger & PSP)", "Vol. 2 · Ch. 11",
    "Double-entry ledger writes remain transactional while settlement and payout execute asynchronously.",
    [
      alexNode("client","client",0,140),alexNode("gateway","api-gateway",300,140),
      alexNode("payment","microservice",600,140,"Payment Service",{replicas:8}),
      alexNode("ledger","sql",900,0,"Double-Entry Ledger",{replicas:4}),
      alexNode("queue","queue",900,280,"Settlement Queue"),
      alexNode("worker","worker",1200,280,"Ledger & Payout Worker",{replicas:6,capacityPerReplica:2000}),
      alexNode("psp","external-api",1500,280,"Card PSP / Stripe",{capacityPerReplica:12000}),
    ],[alexEdge("client","gateway"),alexEdge("gateway","payment","gRPC"),alexEdge("payment","ledger","SQL"),alexEdge("payment","queue","Kafka"),alexEdge("queue","worker","Kafka"),alexEdge("worker","psp")]),
];

export const BLUEPRINTS = Object.freeze([
  ...CORE_BLUEPRINTS.map((blueprint) => ({ ...blueprint, category: "Core Patterns" })),
  ...ALEX_XU_BLUEPRINTS,
]);

export function getBlueprint(id) {
  return BLUEPRINTS.find((blueprint) => blueprint.id === id) || null;
}

/** Scene-space size of a blueprint (for centring / placing it clear of existing content). */
export function blueprintExtent(blueprint, nodeSize) {
  if (blueprint.nodes.some((node) => Number.isFinite(node.x) && Number.isFinite(node.y))) {
    return {
      width: Math.max(...blueprint.nodes.map((node) => (node.x || 0) + (node.width || nodeSize.width))),
      height: Math.max(...blueprint.nodes.map((node) => (node.y || 0) + (node.height || nodeSize.height))),
    };
  }
  const cols = Math.max(...blueprint.nodes.map((n) => n.at[0])) + 1;
  const rows = Math.max(...blueprint.nodes.map((n) => n.at[1])) + 1;
  return { width: (cols - 1) * BLUEPRINT_GRID.columnWidth + nodeSize.width, height: (rows - 1) * BLUEPRINT_GRID.rowHeight + nodeSize.height };
}
