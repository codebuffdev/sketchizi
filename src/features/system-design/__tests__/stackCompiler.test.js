import test from "node:test";
import assert from "node:assert/strict";
import { compileDockerCompose, compileKubernetesStack, inferStackDependencies } from "../stackCompiler.js";
import { deriveArchitectureDiagnostic } from "../architectureDiagnostics.js";
import { simulateTraffic } from "../trafficSimulator.js";
import { getPrimitive } from "../primitives.js";

const nodes = [
  { id: "api", kind: "microservice", label: "Order API", replicas: 2, port: 8080, image: "example/order-api:1" },
  { id: "redis", kind: "redis", label: "Redis Cache", replicas: 1, port: 6379, image: "redis:7" },
  { id: "db", kind: "sql", label: "SQL Database", replicas: 1, port: 5432, image: "postgres:16" },
  { id: "kafka", kind: "queue", label: "Message Queue / Kafka", replicas: 1, port: 9092, image: "bitnami/kafka:3.7" },
];
const edges = [{ id: "a-r", from: "api", to: "redis" }, { id: "a-db", from: "api", to: "db" }, { id: "a-k", from: "api", to: "kafka" }];

test("graph dependencies wire Redis, SQL and Kafka environment in Kubernetes ConfigMap", () => {
  const yaml = compileKubernetesStack(nodes, edges);
  assert.match(yaml, /REDIS_URL: "redis:\/\/redis-cache:6379"/);
  assert.match(yaml, /DATABASE_URL: "postgresql:\/\/postgres:5432\/app"/);
  assert.match(yaml, /KAFKA_BROKERS: "kafka:9092"/);
  assert.match(yaml, /kind: ConfigMap/);
  assert.match(yaml, /kind: HorizontalPodAutoscaler/);
  assert.match(yaml, /replicas: 2/);
});

test("graph dependencies wire Redis and DATABASE_URL in Docker Compose and add depends_on", () => {
  const yaml = compileDockerCompose(nodes, edges);
  assert.match(yaml, /REDIS_URL: "redis:\/\/redis-cache:6379"/);
  assert.match(yaml, /DATABASE_URL: "postgresql:\/\/postgres:5432\/app"/);
  assert.match(yaml, /KAFKA_BROKERS: "kafka:9092"/);
  assert.match(yaml, /depends_on:/);
  assert.match(yaml, /networks:/);
  assert.match(yaml, /volumes:/);
});

test("compiler infers only valid connected service dependencies", () => {
  const result = inferStackDependencies(nodes, [...edges, { from: "missing", to: "db" }]);
  assert.deepEqual(result.dependencies.get("api"), ["redis-cache", "postgres", "kafka"]);
  assert.equal(result.environments.get("api").DATABASE_URL, "postgresql://postgres:5432/app");
});

test("default capacities match the intended traffic model", () => {
  assert.equal(getPrimitive("sql").capacityPerReplica, 4000);
  assert.equal(getPrimitive("microservice").capacityPerReplica, 6000);
  assert.equal(getPrimitive("redis").capacityPerReplica, 40000);
  assert.equal(getPrimitive("cdn").capacityPerReplica, 100000);
});

test("architecture diagnostic identifies an overloaded service with a concrete fix", () => {
  const graph = [
    { id: "client", kind: "client", replicas: 1, capacityPerReplica: 100000, health: "healthy" },
    { id: "api", kind: "microservice", label: "Read API", replicas: 1, capacityPerReplica: 6000, health: "healthy" },
  ];
  const edges = [{ id: "request", from: "client", to: "api" }];
  const simulation = simulateTraffic({ nodes: graph, edges, totalRps: 10000 });
  const diagnostic = deriveArchitectureDiagnostic(graph, simulation, edges);
  assert.equal(simulation.nodes.api.status, "overloaded");
  assert.match(diagnostic.message, /Bottleneck: Read API at 167% load/);
  assert.match(diagnostic.message, /increase replicas/);
});

test("architecture diagnostic reports cache shielding and single-replica SPOFs", () => {
  const graph = [
    { id: "client", kind: "client", replicas: 1, capacityPerReplica: 100000, health: "healthy" },
    { id: "cache", kind: "redis", replicas: 1, capacityPerReplica: 100000, cacheHitRate: 0.8, health: "healthy" },
    { id: "db", kind: "sql", replicas: 2, capacityPerReplica: 4000, health: "healthy" },
  ];
  const edges = [{ id: "cache-edge", from: "client", to: "cache" }, { id: "db-edge", from: "cache", to: "db" }];
  const simulation = simulateTraffic({ nodes: graph, edges, totalRps: 10000 });
  const diagnostic = deriveArchitectureDiagnostic(graph, simulation, edges);
  assert.match(diagnostic.message, /Cache shielding 80% of reads/);
  const single = [{ ...graph[0] }, { id: "api", kind: "microservice", label: "Read API", replicas: 1, capacityPerReplica: 60000, health: "healthy" }];
  const singleEdges = [{ id: "request", from: "client", to: "api" }];
  const singleSimulation = simulateTraffic({ nodes: single, edges: singleEdges, totalRps: 10000 });
  assert.match(deriveArchitectureDiagnostic(single, singleSimulation, singleEdges).message, /Single Point of Failure: Read API/);
});
