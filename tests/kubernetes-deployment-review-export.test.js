import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKubernetesDeploymentReviewExport,
  renderKubernetesDeploymentReviewMarkdown,
} from "../src/features/architecture/kubernetesDeploymentReviewExport.js";

const error = {
  provider: "kubernetes", code: "KUBERNETES_BAD_SERVICE", severity: "error",
  diagnosticId: "service-1", message: "Service selector does not match Pods",
  remediation: "Update the selector", resourceId: "service/payments",
  relationshipId: "rel-1", relationshipType: "exposes",
  sourceResourceId: "service/payments", sourceResourceType: "Service",
  targetResourceId: "pod/payments", targetResourceType: "Pod",
  secretToken: "must-not-export",
};
const warning = {
  provider: "kubernetes", code: "KUBERNETES_NAMESPACE_REVIEW", severity: "warning",
  diagnosticId: "namespace-1", message: "Namespace context is missing",
};
const unrelated = {
  provider: "aws", code: "AWS_BAD_ROUTE", severity: "error",
  diagnosticId: "aws-1", message: "AWS-only finding",
};

test("export prioritizes Kubernetes findings and calculates review counts", () => {
  const reviewed = new Map([["service-1", {
    fingerprint: JSON.stringify([
      error.code, error.severity, error.message, error.remediation,
      error.resourceId, error.relationshipId, error.relationshipType,
      error.sourceResourceId, error.targetResourceId,
      error.sourceResourceType, error.targetResourceType,
    ]),
  }]]);
  const report = buildKubernetesDeploymentReviewExport({
    validation: { errors: [unrelated, error], warnings: [warning], info: [] },
    reviewedFindings: reviewed,
    generatedAt: "2026-10-17T12:00:00.000Z",
  });
  assert.equal(report.generatedAt, "2026-10-17T12:00:00.000Z");
  assert.deepEqual(report.findings.map((item) => item.code), ["KUBERNETES_BAD_SERVICE", "KUBERNETES_NAMESPACE_REVIEW"]);
  assert.deepEqual(report.summary, { total: 2, errors: 1, warnings: 1, info: 0, reviewed: 1, unreviewed: 1, resolved: 0 });
  assert.equal(report.findings[0].reviewed, true);
});

test("export includes only allowlisted diagnostic fields and excludes unrelated providers", () => {
  const report = buildKubernetesDeploymentReviewExport({
    validation: { errors: [error, unrelated] },
    generatedAt: "2026-10-17T12:00:00Z",
  });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /AWS-only finding|must-not-export|secretToken/);
  assert.match(serialized, /Service selector does not match Pods/);
  assert.match(serialized, /Update the selector/);
  assert.match(report.privacyNote, /does not include the diagram/);
});

test("resolved history is summarized without exporting arbitrary metadata", () => {
  const report = buildKubernetesDeploymentReviewExport({
    validation: { errors: [] },
    resolvedFindings: [{
      id: "service-1::old-fingerprint",
      resolvedReason: "changed",
      diagnostic: { ...error, extraCanvasPayload: { imageData: "private" } },
    }],
    generatedAt: "2026-10-17T12:00:00Z",
  });
  assert.equal(report.summary.resolved, 1);
  assert.equal(report.resolvedHistory[0].reason, "changed");
  assert.doesNotMatch(JSON.stringify(report), /extraCanvasPayload|imageData|must-not-export/);
});

test("Markdown report includes remediation, review status, scope and resolution history", () => {
  const report = buildKubernetesDeploymentReviewExport({
    validation: { errors: [error] },
    resolvedFindings: [{ id: "old", resolvedReason: "cleared", diagnostic: warning }],
    generatedAt: "2026-10-17T12:00:00Z",
  });
  const markdown = renderKubernetesDeploymentReviewMarkdown(report);
  assert.match(markdown, /## Current findings/);
  assert.match(markdown, /\*\*Remediation:\*\* Update the selector/);
  assert.match(markdown, /Not reviewed/);
  assert.match(markdown, /## Resolution history/);
  assert.match(markdown, /No longer present/);
  assert.match(markdown, /does not contact a Kubernetes cluster/);
});

test("Markdown table delimiters and newlines in user-facing diagnostic text are neutralized", () => {
  const report = buildKubernetesDeploymentReviewExport({
    validation: { errors: [{ ...error, message: "Bad | value\nsecond line" }] },
    generatedAt: "2026-10-17T12:00:00Z",
  });
  const markdown = renderKubernetesDeploymentReviewMarkdown(report);
  assert.match(markdown, /Bad \\\| value second line/);
});
