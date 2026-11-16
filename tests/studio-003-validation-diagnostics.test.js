import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStudioDiagnostics, summarizeStudioDiagnostics } from "../src/features/studio-validation/diagnostics.js";
import { validateComposeDocument } from "../src/features/docker-compose/composeDocumentService.js";
import { validateKubernetesResources } from "../src/features/kubernetes-studio/validation/validateKubernetesResources.js";

test("STUDIO-003 adapts actual Compose validation findings without mutating source", () => {
  const original = validateComposeDocument({ services: { api: { image: "nginx:1", depends_on: ["missing"] } } }).findings;
  const before = structuredClone(original);
  const diagnostics = normalizeStudioDiagnostics("docker-compose", original);
  assert.ok(diagnostics.some((item) => item.code === "COMPOSE_UNKNOWN_DEPENDENCY"));
  assert.ok(diagnostics.every((item) => item.studio === "docker-compose"));
  assert.equal(summarizeStudioDiagnostics(diagnostics).valid, false);
  assert.deepEqual(original, before);
});

test("STUDIO-003 adapts Kubernetes resource findings with stable resource context", () => {
  const resources = [{
    id: "deployment:demo", kind: "Deployment", name: "demo", namespace: "default",
    apiVersion: "apps/v1",
    manifest: { spec: { selector: { matchLabels: { app: "demo" } }, template: { metadata: { labels: { app: "demo" } }, spec: { containers: [{ name: "api" }] } } } },
  }];
  const issues = validateKubernetesResources(resources);
  assert.ok(issues.length > 0);
  const diagnostics = normalizeStudioDiagnostics("kubernetes", issues);
  assert.ok(diagnostics.some((item) => item.resource === "Deployment/demo" && item.severity === "error"));
  assert.equal(summarizeStudioDiagnostics(diagnostics).valid, false);
});

test("STUDIO-003 sorts errors before warnings and keeps deterministic identifiers", () => {
  const findings = [{ code: "W", severity: "warning", message: "warning" }, { code: "E", severity: "error", message: "error" }];
  const first = normalizeStudioDiagnostics("docker-compose", findings);
  assert.deepEqual(first.map((item) => item.code), ["E", "W"]);
  assert.deepEqual(first, normalizeStudioDiagnostics("docker-compose", findings));
  assert.deepEqual(summarizeStudioDiagnostics(first).counts, { error: 1, warning: 1, info: 0 });
});

test("STUDIO-003 rejects unknown sources and malformed finding collections", () => {
  assert.throws(() => normalizeStudioDiagnostics("other", []), /Unsupported studio/);
  assert.throws(() => normalizeStudioDiagnostics("kubernetes", null), /array/);
});
