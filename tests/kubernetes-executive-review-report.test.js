import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKubernetesExecutiveReviewReport,
  renderKubernetesExecutiveReviewMarkdown,
} from "../src/features/architecture/kubernetesExecutiveReviewReport.js";

const reviewReport = {
  findings: [
    { id: "err", code: "KUBERNETES_REPLICAS", severity: "error", message: "Replicas invalid", remediation: "Set replicas to a positive integer", resourceId: "deployment/api", reviewed: false, secret: "never export" },
    { id: "warn", code: "KUBERNETES_SELECTOR", severity: "warning", message: "Selector missing", remediation: "Add a selector", resourceId: "service/api", reviewed: true },
  ],
  scopeNote: "Diagram only",
};

test("executive report combines readiness, review coverage, comparison, and remediation", () => {
  const report = buildKubernetesExecutiveReviewReport({
    reviewReport,
    readiness: { status: "action-required", title: "Kubernetes Deployment Readiness", summary: "One error", scopeNote: "Diagram only" },
    comparison: { added: [{}], changed: [{}, {}], resolved: [], unchanged: [{}] },
    remediationTasks: [
      { id: "err", code: "KUBERNETES_REPLICAS", severity: "error", status: "pending", findingPresent: true, resourceId: "deployment/api", remediation: "Fix replicas" },
      { id: "old", code: "KUBERNETES_OLD", severity: "warning", status: "pending", findingPresent: false },
    ],
    generatedAt: "2026-10-17T00:00:00Z",
  });
  assert.equal(report.readiness.status, "action-required");
  assert.equal(report.summary.findings, 2);
  assert.equal(report.summary.errors, 1);
  assert.equal(report.summary.reviewed, 1);
  assert.equal(report.summary.unreviewed, 1);
  assert.equal(report.summary.reviewCoveragePercent, 50);
  assert.equal(report.summary.remediationPending, 2);
  assert.equal(report.summary.pendingErrors, 1);
  assert.equal(report.summary.pendingResolvedFindings, 1);
  assert.equal(report.summary.remediationCompletionPercent, 0);
  assert.deepEqual(report.comparison, { added: 1, changed: 2, resolved: 0, unchanged: 1 });
  assert.equal(report.priorities[0].code, "KUBERNETES_REPLICAS");
  assert.equal(JSON.stringify(report).includes("never export"), false);
});

test("executive Markdown export includes priorities and explicit scope limitations", () => {
  const report = buildKubernetesExecutiveReviewReport({
    reviewReport,
    readiness: { status: "action-required", title: "Kubernetes Deployment Readiness", summary: "One error" },
    remediationTasks: [],
  });
  const markdown = renderKubernetesExecutiveReviewMarkdown(report);
  assert.match(markdown, /Executive summary/);
  assert.match(markdown, /Priority actions/);
  assert.match(markdown, /KUBERNETES_REPLICAS/);
  assert.match(markdown, /Suggested remediation/);
  assert.match(markdown, /No live Kubernetes API/);
  assert.match(markdown, /Snapshot comparison/);
  assert.match(markdown, /No snapshot comparison was active/);
});

test("empty executive report renders safe zero-state summaries", () => {
  const report = buildKubernetesExecutiveReviewReport();
  assert.equal(report.summary.findings, 0);
  assert.equal(report.summary.reviewCoveragePercent, 100);
  assert.equal(report.summary.remediationCompletionPercent, 0);
  assert.match(renderKubernetesExecutiveReviewMarkdown(report), /No remediation tasks have been saved/);
});


test("finding references are stable, readable, and do not expose source identifiers", () => {
  const input = {
    findings: [
      { id: "private-canvas-id-123", code: "KUBERNETES_REPLICAS", severity: "error", message: "Replicas invalid", resourceId: "deployment/api", reviewed: false },
      { id: "private-canvas-id-456", code: "KUBERNETES_SELECTOR", severity: "warning", message: "Selector missing", resourceId: "service/api", reviewed: false },
    ],
  };
  const first = buildKubernetesExecutiveReviewReport({ reviewReport: input, generatedAt: "2026-10-17T00:00:00Z" });
  const second = buildKubernetesExecutiveReviewReport({ reviewReport: { findings: [...input.findings].reverse() }, generatedAt: "2026-10-18T00:00:00Z" });
  const refs = (report) => Object.fromEntries(report.findings.map((item) => [item.code, item.findingRef]));
  assert.deepEqual(refs(first), refs(second));
  assert.match(first.findings[0].findingRef, /^K8S-[0-9A-F]{8}$/);
  assert.equal(JSON.stringify(first).includes("private-canvas-id"), false);
});

test("priority groups distinguish errors, unreviewed warnings, and unreviewed information", () => {
  const report = buildKubernetesExecutiveReviewReport({
    reviewReport: { findings: [
      { code: "ERR", severity: "error", message: "Error", reviewed: true },
      { code: "WARN", severity: "warning", message: "Warning", reviewed: false },
      { code: "INFO", severity: "info", message: "Info", reviewed: false },
      { code: "DONE", severity: "warning", message: "Reviewed warning", reviewed: true },
    ] },
  });
  assert.equal(report.priorityGroups.high.length, 1);
  assert.equal(report.priorityGroups.medium.length, 1);
  assert.equal(report.priorityGroups.review.length, 1);
  assert.equal(report.summary.priorityHigh, 1);
  assert.equal(report.summary.priorityMedium, 1);
  assert.equal(report.summary.priorityReview, 1);
  assert.equal(report.priorities.some((item) => item.code === "DONE"), false);
});

test("report metadata and Markdown expose versioning and stable references", () => {
  const report = buildKubernetesExecutiveReviewReport({
    reviewReport,
    generatedAt: "2026-10-17T00:00:00Z",
  });
  const markdown = renderKubernetesExecutiveReviewMarkdown(report);
  assert.equal(report.reportVersion, "1.13.6");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.metadata.generatedAt, "2026-10-17T00:00:00Z");
  assert.equal(report.metadata.findingReferenceScheme, "K8S-FNV1A32-v1");
  assert.match(markdown, /Report version: 1\.13\.6/);
  assert.match(markdown, /High priority — errors/);
  assert.match(markdown, /K8S-[0-9A-F]{8}/);
});
