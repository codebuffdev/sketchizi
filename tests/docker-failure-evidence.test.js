import test from "node:test";
import assert from "node:assert/strict";
import { extractDockerFailureEvidence } from "../server/docker-failure-evidence.mjs";

test("failure evidence matches a declared Compose service from an error line", () => {
  assert.deepEqual(extractDockerFailureEvidence("web  | Error: connection refused", "", ["web", "db"]), { serviceName: "web", line: "web  | Error: connection refused", confidence: "service-match" });
});

test("failure evidence stays output-only when no service can be matched", () => {
  assert.deepEqual(extractDockerFailureEvidence("", "failed to pull image", ["web", "db"]), { line: "failed to pull image", confidence: "output-only" });
});

test("failure evidence handles empty output and bounds evidence lines", () => {
  assert.equal(extractDockerFailureEvidence("", "", ["web"]), null);
  const evidence = extractDockerFailureEvidence("x".repeat(300), "", []);
  assert.equal(evidence.line.length, 240);
});
