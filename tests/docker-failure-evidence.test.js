import test from "node:test";
import assert from "node:assert/strict";
import { extractDockerFailureEvidence } from "../server/docker-failure-evidence.mjs";

test("failure evidence matches a declared Compose service from an error line", () => {
  assert.deepEqual(extractDockerFailureEvidence("web  | Error: connection refused", "", { web: {}, db: {} }), { serviceName: "web", line: "web  | Error: connection refused", confidence: "service-match", relation: "direct" });
});

test("failure evidence stays output-only when no service can be matched", () => {
  assert.deepEqual(extractDockerFailureEvidence("", "failed to pull image", { web: {}, db: {} }), { line: "failed to pull image", confidence: "output-only", relation: "unattributed" });
});

test("service matching respects Compose service-name boundaries", () => {
  const result = extractDockerFailureEvidence("api-worker failed to start", "", { api: {}, "api-worker": {} });
  assert.equal(result.serviceName, "api-worker");
  assert.equal(result.confidence, "service-match");
});

test("dependency failure lines validate an upstream edge declared as a depends_on list", () => {
  const result = extractDockerFailureEvidence("web depends on db which is unhealthy", "", { web: { depends_on: ["db"] }, db: {} });
  assert.equal(result.serviceName, "db");
  assert.equal(result.dependentServiceName, "web");
  assert.equal(result.confidence, "dependency-context");
  assert.equal(result.relation, "upstream-dependency");
});

test("dependency failure lines validate mapping-form depends_on declarations", () => {
  const result = extractDockerFailureEvidence("api depends on postgres which failed", "", {
    api: { depends_on: { postgres: { condition: "service_healthy" } } },
    postgres: {},
  });
  assert.equal(result.serviceName, "postgres");
  assert.equal(result.dependentServiceName, "api");
  assert.equal(result.relation, "upstream-dependency");
});

test("dependency wording cannot infer an undeclared dependency edge", () => {
  const result = extractDockerFailureEvidence("web depends on db which is unhealthy", "", { web: {}, db: {} });
  assert.equal(result.serviceName, undefined);
  assert.deepEqual(result.candidateServices, ["web", "db"]);
  assert.equal(result.confidence, "ambiguous");
  assert.equal(result.relation, "ambiguous");
});

test("multiple declared dependency edges remain ambiguous", () => {
  const result = extractDockerFailureEvidence("web depends on db and cache failed", "", {
    web: { depends_on: ["db", "cache"] }, db: {}, cache: {},
  });
  assert.equal(result.confidence, "ambiguous");
  assert.deepEqual(result.candidateServices, ["web", "db", "cache"]);
});

test("multi-service lines without dependency context remain ambiguous", () => {
  const result = extractDockerFailureEvidence("web and db failed during startup", "", { web: {}, db: {} });
  assert.equal(result.serviceName, undefined);
  assert.deepEqual(result.candidateServices, ["web", "db"]);
  assert.equal(result.confidence, "ambiguous");
});

test("failure evidence handles empty output and bounds evidence lines", () => {
  assert.equal(extractDockerFailureEvidence("", "", { web: {} }), null);
  const evidence = extractDockerFailureEvidence("x".repeat(300), "", {});
  assert.equal(evidence.line.length, 240);
});

import { getServiceFailureRemediation } from "../server/docker-failure-evidence.mjs";

test("remediation identifies private image pull failures without claiming recovery", () => {
  const result = getServiceFailureRemediation({ serviceName: "api", confidence: "service-match", line: "api pull access denied" }, { api: { image: "private/api:latest" } }, "pull access denied", "");
  assert.equal(result.basis, "image-pull-error");
  assert.match(result.detail, /registry permissions/);
});

test("remediation uses service build paths for Dockerfile errors", () => {
  const result = getServiceFailureRemediation({ serviceName: "api", confidence: "service-match", line: "failed to read dockerfile" }, { api: { build: { context: "./api", dockerfile: "Dockerfile.prod" } } }, "failed to read dockerfile", "");
  assert.equal(result.basis, "dockerfile-path-error");
  assert.ok(result.detail.includes("./api"));
  assert.ok(result.detail.includes("Dockerfile.prod"));
});

test("remediation identifies published ports when a port conflict occurs", () => {
  const result = getServiceFailureRemediation({ serviceName: "web", confidence: "service-match", line: "port is already allocated" }, { web: { ports: ["8080:80"] } }, "port is already allocated", "");
  assert.equal(result.basis, "port-conflict");
  assert.match(result.detail, /8080:80/);
});

test("ambiguous service evidence does not recommend a specific service as root cause", () => {
  const result = getServiceFailureRemediation({ confidence: "ambiguous", candidateServices: ["api", "db"], line: "api and db failed" }, { api: {}, db: {} }, "", "");
  assert.equal(result.basis, "ambiguous-evidence");
  assert.match(result.detail, /multiple possible services/);
});
