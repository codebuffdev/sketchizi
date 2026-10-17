import test from "node:test";
import assert from "node:assert/strict";
import { buildKubernetesDeploymentReadinessReport } from "../src/features/architecture/kubernetesDeploymentReadinessReport.js";

const item = (code, severity, extra = {}) => ({
  code, severity, provider: "kubernetes", diagnosticId: `${code}|${extra.resourceId || ""}`,
  message: `${code} message`, ...extra,
});

test("readiness report prioritizes errors, warnings, then optional information", () => {
  const report = buildKubernetesDeploymentReadinessReport({
    errors: [item("KUBERNETES_INVALID_RELATIONSHIP", "error", { relationshipId: "r1" })],
    warnings: [item("KUBERNETES_CLUSTER_NAMESPACE_LINK_MISSING", "warning", { resourceId: "ns1" })],
    info: [item("KUBERNETES_POD_NODE_PLACEMENT_RECOMMENDED", "info", { resourceId: "pod1" })],
  });
  assert.equal(report.status, "action-required");
  assert.deepEqual(report.counts, { total: 3, errors: 1, warnings: 1, info: 1 });
  assert.deepEqual(report.findings.map((finding) => finding.severity), ["error", "warning", "info"]);
  assert.equal(report.isReadOnly, true);
});

test("report combines resource validation, relationship validation, and completeness findings", () => {
  const report = buildKubernetesDeploymentReadinessReport({
    errors: [item("KUBERNETES_INVALID_RESOURCE_NAME", "error", { resourceId: "pod1" })],
    warnings: [item("KUBERNETES_CONTROLLER_POD_MODEL_MISSING", "warning", { resourceId: "deploy1" })],
    info: [item("KUBERNETES_CLUSTER_CONTEXT_RECOMMENDED", "info")],
  });
  assert.equal(report.counts.total, 3);
  assert.match(report.summary, /1 action-required, 1 review-recommended, 1 optional/);
});

test("non-Kubernetes diagnostics are excluded from the Kubernetes report", () => {
  const report = buildKubernetesDeploymentReadinessReport({
    errors: [{ code: "AWS_INVALID_RELATIONSHIP", severity: "error", provider: "aws" }],
    warnings: [{ code: "NETWORKING_WARNING", severity: "warning", provider: "networking" }],
  });
  assert.equal(report.counts.total, 0);
  assert.equal(report.status, "no-findings");
});

test("duplicate findings are deduplicated without mutating the validation input", () => {
  const duplicate = item("KUBERNETES_CLUSTER_CONTEXT_RECOMMENDED", "info");
  const input = { errors: [], warnings: [], info: [duplicate, { ...duplicate }] };
  const before = structuredClone(input);
  const report = buildKubernetesDeploymentReadinessReport(input);
  assert.equal(report.counts.total, 1);
  assert.deepEqual(input, before);
});

test("readiness report explicitly states it is not a live cluster readiness check", () => {
  const report = buildKubernetesDeploymentReadinessReport(null);
  assert.match(report.scopeNote, /does not contact a Kubernetes cluster/);
  assert.equal(report.isReadOnly, true);
});
