import test from "node:test";
import assert from "node:assert/strict";
import { compareKubernetesDeploymentReviews } from "../src/features/architecture/kubernetesDeploymentReviewComparison.js";

const finding = (id, severity = "warning", message = "Review namespace", remediation = "Set namespace") => ({
  id, code: `KUBERNETES_${id.toUpperCase()}`, severity, message, remediation,
  resourceId: `resource/${id}`, relationshipId: null, relationshipType: null,
  source: { id: null, type: null }, target: { id: null, type: null },
});

test("comparison categorizes new, unchanged, changed, and resolved findings", () => {
  const baseline = {
    generatedAt: "baseline",
    findings: [finding("stable"), finding("changed", "warning", "Old message"), finding("gone")],
  };
  const current = {
    generatedAt: "current",
    findings: [finding("stable"), finding("changed", "error", "New message"), finding("new", "error")],
  };
  const result = compareKubernetesDeploymentReviews(baseline, current);
  assert.deepEqual(result.counts, {
    added: 1, changed: 1, resolved: 1, unchanged: 1, current: 3, baseline: 3,
    severityIncreased: 1, severityDecreased: 0,
  });
  assert.equal(result.added[0].finding.id, "new");
  assert.equal(result.changed[0].finding.id, "changed");
  assert.equal(result.changed[0].changes.severity, true);
  assert.equal(result.resolved[0].finding.id, "gone");
  assert.equal(result.unchanged[0].finding.id, "stable");
  assert.equal(result.baselineGeneratedAt, "baseline");
  assert.equal(result.currentGeneratedAt, "current");
});

test("severity decrease is distinguished from severity increase", () => {
  const result = compareKubernetesDeploymentReviews(
    { findings: [finding("x", "error")] },
    { findings: [finding("x", "info")] },
  );
  assert.equal(result.counts.changed, 1);
  assert.equal(result.counts.severityIncreased, 0);
  assert.equal(result.counts.severityDecreased, 1);
});

test("relationship endpoint and remediation changes count as a changed finding", () => {
  const old = { ...finding("edge"), source: { id: "pod/a", type: "Pod" }, target: { id: "svc/a", type: "Service" } };
  const next = { ...old, remediation: "Use a Service selector", target: { id: "svc/b", type: "Service" } };
  const result = compareKubernetesDeploymentReviews({ findings: [old] }, { findings: [next] });
  assert.equal(result.counts.changed, 1);
  assert.equal(result.changed[0].changes.remediation, true);
  assert.equal(result.changed[0].changes.relationship, true);
});

test("empty and missing snapshots compare safely", () => {
  const result = compareKubernetesDeploymentReviews(null, { findings: [finding("new")] });
  assert.equal(result.counts.added, 1);
  assert.equal(result.counts.resolved, 0);
  assert.match(result.scopeNote, /not a live Kubernetes cluster comparison/);
});
