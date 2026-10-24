import test from "node:test";
import assert from "node:assert/strict";
import { extractDockerFailureEvidence } from "../server/docker-failure-evidence.mjs";

test("failure evidence matches a declared Compose service from an error line", () => {
  assert.deepEqual(extractDockerFailureEvidence("web  | Error: connection refused", "", ["web", "db"]), { serviceName: "web", line: "web  | Error: connection refused", confidence: "service-match", relation: "direct" });
});

test("failure evidence stays output-only when no service can be matched", () => {
  assert.deepEqual(extractDockerFailureEvidence("", "failed to pull image", ["web", "db"]), { line: "failed to pull image", confidence: "output-only", relation: "unattributed" });
});

test("service matching respects Compose service-name boundaries", () => {
  const result = extractDockerFailureEvidence("api-worker failed to start", "", ["api", "api-worker"]);
  assert.equal(result.serviceName, "api-worker");
  assert.equal(result.confidence, "service-match");
});

test("dependency failure lines identify upstream and dependent services separately", () => {
  const result = extractDockerFailureEvidence("web depends on db which is unhealthy", "", ["web", "db"]);
  assert.equal(result.serviceName, "db");
  assert.equal(result.dependentServiceName, "web");
  assert.equal(result.confidence, "dependency-context");
  assert.equal(result.relation, "upstream-dependency");
});

test("multi-service lines without dependency context remain ambiguous", () => {
  const result = extractDockerFailureEvidence("web and db failed during startup", "", ["web", "db"]);
  assert.equal(result.serviceName, undefined);
  assert.deepEqual(result.candidateServices, ["web", "db"]);
  assert.equal(result.confidence, "ambiguous");
});

test("failure evidence handles empty output and bounds evidence lines", () => {
  assert.equal(extractDockerFailureEvidence("", "", ["web"]), null);
  const evidence = extractDockerFailureEvidence("x".repeat(300), "", []);
  assert.equal(evidence.line.length, 240);
});
