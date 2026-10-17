import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/components/app/ArchitectureValidationPanel.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/architecture-validation.css", import.meta.url), "utf8");

test("validation panel provides all, unreviewed, and reviewed filters", () => {
  assert.match(panel, /value="all">All findings/);
  assert.match(panel, /value="unreviewed">Not reviewed/);
  assert.match(panel, /value="reviewed">Reviewed/);
});

test("resource filter can find resource and relationship endpoint findings", () => {
  assert.match(panel, /item\.sourceResourceId/);
  assert.match(panel, /item\.targetResourceId/);
  assert.match(panel, /Resource/);
});

test("reviewed state is explicit and accessible with aria-pressed", () => {
  assert.match(panel, /Mark reviewed/);
  assert.match(panel, /Mark not reviewed/);
  assert.match(panel, /aria-pressed=/);
  assert.match(panel, /reviewedFindings/);
});

test("finding selection remains wired to canvas element selection", () => {
  assert.match(panel, /onSelectDiagnostic\?\.\(diagnostic\)/);
  assert.match(panel, /Select affected canvas element/);
});

test("review controls have responsive and dark-theme styles", () => {
  assert.match(styles, /\.app\.theme-dark \.architecture-review-toggle/);
  assert.match(styles, /@media \(max-width: 420px\)/);
});


test("revalidation fingerprints findings and tracks missing or changed findings as resolved history", () => {
  assert.match(panel, /diagnosticFingerprint/);
  assert.match(panel, /previousDiagnosticsRef/);
  assert.match(panel, /newlyResolved/);
  assert.match(panel, /Resolved since last review/);
  assert.match(panel, /finding changed after revalidation/);
  assert.match(panel, /finding no longer present/);
});

test("review state is invalidated when a finding's fingerprint changes", () => {
  assert.match(panel, /current\.fingerprint !== previousEntry\.fingerprint/);
  assert.match(panel, /next\.delete\(key\)/);
  assert.match(panel, /reviewedFindings\.get\(id\)\?\.fingerprint === diagnosticFingerprint\(item\)/);
});


test("review report export offers Markdown and JSON without diagram export", () => {
  assert.match(panel, /Export review as Markdown/);
  assert.match(panel, /Export review as JSON/);
  assert.match(panel, /buildKubernetesDeploymentReviewExport/);
  assert.match(panel, /resolvedFindings/);
  assert.match(panel, /not the diagram/);
});


test("review snapshots can be saved, selected, compared, and deleted", () => {
  assert.match(panel, /Save review snapshot/);
  assert.match(panel, /Saved review history/);
  assert.match(panel, /Compare with saved/);
  assert.match(panel, /Delete selected snapshot/);
  assert.match(panel, /loadKubernetesReviewHistory/);
  assert.match(panel, /saveKubernetesReviewSnapshot/);
  assert.match(panel, /deleteKubernetesReviewSnapshot/);
  assert.match(panel, /Up to 10 sanitized snapshots/);
});


test("saved history view displays dates, severity summaries, review status, and actions", () => {
  assert.match(panel, /Saved review history/);
  assert.match(panel, /View history/);
  assert.match(panel, /historySummaries/);
  assert.match(panel, /errors/);
  assert.match(panel, /warnings/);
  assert.match(panel, /reviewed/);
  assert.match(panel, /Compare/);
  assert.match(panel, /Delete/);
  assert.match(panel, /No saved review snapshots yet/);
});


test("comparison results offer Markdown and JSON comparison exports", () => {
  assert.match(panel, /Export comparison as Markdown/);
  assert.match(panel, /Export comparison as JSON/);
  assert.match(panel, /downloadComparisonReport/);
  assert.match(panel, /buildKubernetesDeploymentReviewComparisonExport/);
  assert.match(panel, /setComparisonReportPair/);
});


test("comparison UI includes severity badges, summary metrics, and canvas navigation", () => {
  assert.match(panel, /architecture-review-comparison-summary/);
  assert.match(panel, /severity increased/);
  assert.match(panel, /architecture-review-severity-badge/);
  assert.match(panel, /Go to finding/);
  assert.match(panel, /onSelectDiagnostic\?\.\(currentMatch\)/);
  assert.match(panel, /groupKey === "resolved"/);
  assert.match(panel, /no current canvas target is available/i);
  assert.match(panel, /No matching current canvas target was found/);
  assert.match(styles, /architecture-review-comparison-navigation-note/);
  assert.match(styles, /is-resolved-comparison-item/);
  assert.match(styles, /architecture-review-comparison-stat/);
  assert.match(styles, /architecture-review-jump-button/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});


test("comparison results provide filtering and sorting for changes and Kubernetes resources", () => {
  assert.match(panel, /comparisonFilter/);
  assert.match(panel, /severity-increased/);
  assert.match(panel, /remediation-changed/);
  assert.match(panel, /unresolved-errors/);
  assert.match(panel, /comparisonResourceQuery/);
  assert.match(panel, /comparisonSort/);
  assert.match(panel, /No findings match the current comparison filters/);
  assert.match(styles, /architecture-review-comparison-filters/);
  assert.match(styles, /@media \(max-width: 620px\)/);
});


test("remediation checklist supports status tracking, filtering, and Markdown/JSON export", () => {
  assert.match(panel, /Remediation checklist/);
  assert.match(panel, /Refresh tasks from findings/);
  assert.match(panel, /Export checklist as Markdown/);
  assert.match(panel, /Export checklist as JSON/);
  assert.match(panel, /toggleRemediationTask/);
  assert.match(panel, /Pending errors only/);
  assert.match(panel, /remediationQuery/);
  assert.match(panel, /setKubernetesRemediationTaskStatus/);
  assert.match(styles, /architecture-remediation-task-list/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});


test("remediation checklist exposes finding lifecycle and progress summary", () => {
  assert.match(panel, /Finding resolved/);
  assert.match(panel, /Finding active/);
  assert.match(panel, /pendingResolved/);
  assert.match(panel, /progressPercent/);
  assert.match(panel, /option value="resolved"/);
  assert.match(panel, /option value="active"/);
  assert.match(styles, /architecture-remediation-finding-state/);
});


test("deployment review dashboard summarizes findings, progress, history, and comparison", () => {
  assert.match(panel, /Deployment review dashboard/);
  assert.match(panel, /Current findings/);
  assert.match(panel, /Review coverage/);
  assert.match(panel, /Remediation tasks/);
  assert.match(panel, /Saved review history/);
  assert.match(panel, /Latest snapshot comparison/);
  assert.match(panel, /Show unreviewed findings/);
  assert.match(panel, /Show pending tasks/);
  assert.match(panel, /Open saved history/);
  assert.match(panel, /Focus on changes/);
  assert.match(panel, /aria-valuenow=\{reviewProgressPercent\}/);
  assert.match(styles, /architecture-review-dashboard-grid/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
});


test("executive report exports combined review metrics and priority actions", () => {
  assert.match(panel, /Executive review report/);
  assert.match(panel, /Export executive report as Markdown/);
  assert.match(panel, /Export executive report as JSON/);
  assert.match(panel, /downloadExecutiveReviewReport/);
  assert.match(panel, /buildKubernetesExecutiveReviewReport/);
  assert.match(panel, /renderKubernetesExecutiveReviewMarkdown/);
});


test("review accessibility includes keyboard focus, filter status announcements, and named remediation controls", () => {
  assert.match(panel, /architecture-review-filter-status/);
  assert.match(panel, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(panel, /comparisonVisibleGroups\.reduce\(\(count, group\) => count \+ group\.entries\.length, 0\)/);
  assert.match(panel, /aria-label=\{`Mark remediation task \$\{task\.code \|\| "Finding"\}/);
  assert.match(panel, /setRemediationMessage\(result\.ok/);
  assert.doesNotMatch(panel, /architecture-review-comparison-result" aria-live="polite"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /outline: 3px solid #6d5bd0/);
  assert.match(styles, /\.app\.theme-dark .*:focus-visible/);
  assert.match(styles, /architecture-review-filter-status/);
});


test("review filter empty states explain the problem and provide contextual reset actions", () => {
  assert.match(panel, /No findings match the current comparison filters/);
  assert.match(panel, /Reset comparison filters/);
  assert.match(panel, /setComparisonFilter\("all"\)/);
  assert.match(panel, /setComparisonResourceQuery\(""/);
  assert.match(panel, /setComparisonSort\("severity"\)/);
  assert.match(panel, /No tasks match the current filters/);
  assert.match(panel, /Reset task filters/);
  assert.match(panel, /setRemediationFilter\("all"\)/);
  assert.match(panel, /setRemediationQuery\(""/);
  assert.match(styles, /architecture-review-reset-filters/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
});


test("review dashboard uses consistent action labels and announces meaningful progress values", () => {
  assert.match(panel, /Export executive report as Markdown/);
  assert.match(panel, /Export executive report as JSON/);
  assert.match(panel, /Export review as Markdown/);
  assert.match(panel, /Export review as JSON/);
  assert.match(panel, /Export comparison as Markdown/);
  assert.match(panel, /Export comparison as JSON/);
  assert.match(panel, /Export checklist as Markdown/);
  assert.match(panel, /Export checklist as JSON/);
  assert.match(panel, /Capture comparison baseline/);
  assert.match(panel, /Save review snapshot/);
  assert.match(panel, /Refresh tasks from findings/);
  assert.match(panel, /aria-label={`Diagram review readiness:/);
  assert.match(panel, /aria-valuetext=\{`\$\{reviewProgressPercent\}% reviewed/);
  assert.match(panel, /aria-valuetext=\{`\$\{remediationSummary\.progressPercent\}% complete/);
  assert.match(panel, /architecture-review-dashboard-detail/);
  assert.match(styles, /@media \(max-width: 980px\)/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
});


test("dashboard shortcuts navigate to their target sections and apply the corresponding filters", () => {
  assert.match(panel, /const navigateToReviewSection = \(sectionId\) =>/);
  assert.match(panel, /scrollIntoView\(\{[\s\S]*behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(panel, /id="architecture-review-findings-panel"/);
  assert.match(panel, /id="architecture-remediation-checklist-panel"/);
  assert.match(panel, /id="architecture-review-history-panel"/);
  assert.match(panel, /id="architecture-review-comparison-panel"/);
  assert.match(panel, /setFindingFilter\("unreviewed"\); setResourceFilter\("all"\); navigateToReviewSection\("architecture-review-findings-panel"\)/);
  assert.ok(panel.includes('setRemediationFilter("pending"); setRemediationQuery(""); navigateToReviewSection("architecture-remediation-checklist-panel")'));
  assert.match(panel, /setShowFullHistory\(true\); navigateToReviewSection\("architecture-review-history-panel"\)/);
  assert.ok(panel.includes('setComparisonFilter("changed-only"); setComparisonResourceQuery(""); setComparisonSort("severity"); navigateToReviewSection("architecture-review-comparison-panel")'));
});

test("active review, comparison, and remediation filters are visible and can be cleared", () => {
  assert.match(panel, /aria-label="Active finding filters"/);
  assert.match(panel, /Clear finding filters/);
  assert.match(panel, /aria-label="Active comparison filters"/);
  assert.match(panel, /Clear comparison filters/);
  assert.match(panel, /aria-label="Active remediation filters"/);
  assert.match(panel, /Clear task filters/);
  assert.match(panel, /setFindingFilter\("all"\); setResourceFilter\("all"\)/);
  assert.match(panel, /setComparisonFilter\("all"\); setComparisonResourceQuery\(""\); setComparisonSort\("severity"\)/);
  assert.match(panel, /setRemediationFilter\("all"\); setRemediationQuery\(""\)/);
  assert.match(styles, /architecture-review-active-filters/);
  assert.match(styles, /scroll-margin-top: 18px/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});


test("unified review-view reset clears all review filters without touching review data", () => {
  assert.match(panel, /const resetReviewView = \(\) =>/);
  assert.match(panel, /setFindingFilter\("all"\)/);
  assert.match(panel, /setResourceFilter\("all"\)/);
  assert.match(panel, /setComparisonFilter\("all"\)/);
  assert.match(panel, /setComparisonResourceQuery\(""/);
  assert.match(panel, /setComparisonSort\("severity"\)/);
  assert.match(panel, /setRemediationFilter\("all"\)/);
  assert.match(panel, /setRemediationQuery\(""/);
  assert.match(panel, /hasActiveReviewViewFilters &&/);
  assert.match(panel, /Reset review view/);
  assert.match(panel, /resetReviewView\(\); navigateToReviewSection\("architecture-review-dashboard-panel"\)/);
  assert.doesNotMatch(panel.slice(panel.indexOf("const resetReviewView"), panel.indexOf("const toggleRemediationTask")), /setRemediationTasks|setReviewedFindings|deleteKubernetesReviewSnapshot|setSavedReviewHistory/);
});

test("dashboard shortcuts reflect selected filters and clear conflicting search context", () => {
  assert.match(panel, /aria-pressed=\{findingFilter === "unreviewed"\}/);
  assert.match(panel, /Showing unreviewed findings/);
  assert.match(panel, /aria-pressed=\{remediationFilter === "pending" && !remediationQuery\.trim\(\)\}/);
  assert.match(panel, /Showing pending tasks/);
  assert.match(panel, /aria-expanded=\{showFullHistory\}/);
  assert.match(panel, /aria-pressed=\{comparisonFilter === "changed-only"\}/);
  assert.match(panel, /Showing changes/);
  assert.match(styles, /architecture-review-dashboard-link\.is-active/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});


test("review navigation respects the operating system reduced-motion preference", () => {
  assert.match(panel, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(panel, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
