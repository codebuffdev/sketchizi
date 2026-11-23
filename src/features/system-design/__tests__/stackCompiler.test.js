import test from "node:test";
import assert from "node:assert/strict";
import { compileDockerCompose, compileKubernetesStack, inferStackDependencies } from "../stackCompiler.js";

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
