import test from "node:test";
import assert from "node:assert/strict";
import { convertComposeToKubernetes } from "../src/features/docker-compose/composeToKubernetes.js";

test("converts simple services to Deployment and ClusterIP Service proposals", () => {
  const compose = { services: { api: { image: "example/api:1", ports: ["8080:3000"], environment: { MODE: "dev" } }, worker: { image: "example/worker:1" } } };
  const before = structuredClone(compose);
  const result = convertComposeToKubernetes(compose);
  assert.deepEqual(compose, before);
  assert.deepEqual(result.manifests.map(({ kind, metadata }) => [kind, metadata.name]), [["Deployment", "api"], ["Service", "api"], ["Deployment", "worker"]]);
  assert.equal(result.manifests[0].spec.template.spec.containers[0].env[0].value, "dev");
  assert.equal(result.manifests[1].spec.ports[0].targetPort, 3000);
  assert.ok(result.warnings.some(({ field }) => field === "ports"));
});

test("unsupported Compose features are explicitly reported rather than silently converted", () => {
  const result = convertComposeToKubernetes({ services: { web: { image: "nginx", volumes: ["./data:/data"], depends_on: ["db"] }, db: { build: "." } } });
  assert.equal(result.manifests.length, 1);
  assert.deepEqual(result.warnings.map(({ field }) => field).sort(), ["build", "depends_on", "image", "volumes"]);
});

test("rejects missing services and colliding DNS names", () => {
  assert.throws(() => convertComposeToKubernetes({}), /services mapping/);
  assert.throws(() => convertComposeToKubernetes({ services: { "WEB_API": { image: "nginx" }, "web-api": { image: "nginx" } } }), /colliding/);
});
