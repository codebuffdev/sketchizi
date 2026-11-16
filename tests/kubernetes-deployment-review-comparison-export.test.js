import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKubernetesDeploymentReviewComparisonExport,
  renderKubernetesDeploymentReviewComparisonMarkdown,
} from "../src/features/architecture/kubernetesDeploymentReviewComparisonExport.js";
import { compareKubernetesDeploymentReviews } from "../src/features/architecture/kubernetesDeploymentReviewComparison.js";

const finding = (id, severity, message, remediation) => ({
  id, code: `K8S_${id}`, severity, message, remediation, resourceId: `pod/${id}`,
});

test("comparison export preserves severity and remediation before/after values", () => {
  const baseline = { generatedAt: "2026-10-16T10:00:00Z", findings: [
    finding("changed", "warning", "Old message", "Old remediation"),
    finding("resolved", "error", "Resolved issue", "Old fix"),
  ] };
  const current = { generatedAt: "2026-10-17T10:00:00Z", findings: [
    finding("changed", "error", "New message", "New remediation"),
    finding("added", "info", "New issue", "New fix"),
  ] };
  const comparison = compareKubernetesDeploymentReviews(baseline, current);
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison, baseline, current, generatedAt: "2026-10-17T11:00:00Z",
  });

  assert.equal(report.reportType, "sketchizi-kubernetes-deployment-review-comparison");
  assert.deepEqual(report.summary, {
    added: 1, changed: 1, resolved: 1, unchanged: 0, current: 2, baseline: 2,
    severityIncreased: 1, severityDecreased: 0,
  });
  const changed = report.changes.changed[0];
  assert.deepEqual(changed.changes.severity, { from: "warning", to: "error" });
  assert.deepEqual(changed.changes.message, { from: "Old message", to: "New message" });
  assert.deepEqual(changed.changes.remediation, { from: "Old remediation", to: "New remediation" });
  assert.equal(report.changes.resolved[0].previous.message, "Resolved issue");
  assert.equal(report.changes.added[0].finding.id, "added");
  assert.match(report.privacyNote, /excludes the full diagram/);
});

test("Markdown report explains additions, resolutions, severity and remediation changes", () => {
  const baseline = { generatedAt: "baseline", findings: [finding("x", "warning", "Old", "Fix old"), finding("gone", "error", "Gone", "Fix gone")] };
  const current = { generatedAt: "current", findings: [finding("x", "error", "New", "Fix new")] };
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison: compareKubernetesDeploymentReviews(baseline, current), baseline, current,
  });
  const markdown = renderKubernetesDeploymentReviewComparisonMarkdown(report);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## New findings/);
  assert.match(markdown, /## Changed findings/);
  assert.match(markdown, /## Resolved findings/);
  assert.match(markdown, /Severity: `warning` → `error`/);
  assert.match(markdown, /Remediation: `Fix old` → `Fix new`/);
  assert.match(markdown, /Previous remediation: Fix gone/);
  assert.match(markdown, /not a live Kubernetes cluster comparison/);
});

test("comparison export safely handles missing inputs and excludes arbitrary finding metadata", () => {
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison: { counts: {}, added: [{ identity: "safe", finding: { id: "safe", code: "K8S_SAFE", message: "ok", secret: "must not leak" } }] },
  });
  assert.equal(report.changes.added[0].finding.secret, undefined);
  assert.equal(report.summary.added, 0);
  assert.match(renderKubernetesDeploymentReviewComparisonMarkdown(report), /None\./);
});


test("comparison exports include stable references and versioned metadata", () => {
  const baseline = {
    generatedAt: "baseline",
    findings: [finding("stable", "warning", "Before", "Old fix")],
  };
  const current = {
    generatedAt: "current",
    findings: [finding("stable", "error", "After", "New fix")],
  };
  const comparison = compareKubernetesDeploymentReviews(baseline, current);
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison, baseline, current, generatedAt: "2026-10-17T12:00:00Z",
  });
  assert.equal(report.reportVersion, "1.13.7");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.metadata.generatedAt, "2026-10-17T12:00:00Z");
  assert.match(report.changes.changed[0].findingRef, /^K8S-[0-9A-F]{8}$/);
  assert.equal(report.remediationChanges.changed, 1);
  const markdown = renderKubernetesDeploymentReviewComparisonMarkdown(report);
  assert.match(markdown, /Reference scheme: K8S-FNV1A32-COMPARISON-v1/);
  assert.match(markdown, /Changed remediation guidance: 1/);
  assert.match(markdown, /Old fix/);
  assert.match(markdown, /New fix/);
  assert.match(markdown, /K8S-[0-9A-F]{8}/);
});

test("comparison reference stays the same when a finding changes between snapshots", () => {
  const baseline = { findings: [finding("stable-id", "warning", "Before", "Old fix")] };
  const current = { findings: [finding("stable-id", "error", "After", "New fix")] };
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison: compareKubernetesDeploymentReviews(baseline, current),
    baseline, current,
  });
  const secondReport = buildKubernetesDeploymentReviewComparisonExport({
    comparison: compareKubernetesDeploymentReviews(
      { findings: [finding("stable-id", "warning", "Different before text", "Old fix")] },
      { findings: [finding("stable-id", "error", "Different after text", "New fix")] },
    ),
    baseline,
    current,
  });
  assert.equal(report.changes.changed[0].findingRef, secondReport.changes.changed[0].findingRef);
  assert.equal(JSON.stringify(report).includes('"identity"'), false);
});

test("comparison Markdown labels finding references for resolved items", () => {
  const baseline = { findings: [finding("gone", "error", "Removed finding", "Previous fix")] };
  const current = { findings: [] };
  const report = buildKubernetesDeploymentReviewComparisonExport({
    comparison: compareKubernetesDeploymentReviews(baseline, current),
    baseline, current,
  });
  const markdown = renderKubernetesDeploymentReviewComparisonMarkdown(report);
  assert.match(markdown, /## Resolved findings/);
  assert.match(markdown, /Previous remediation: Previous fix/);
  assert.match(markdown, /\*\*Reference:\*\* K8S-[0-9A-F]{8}/);
});
