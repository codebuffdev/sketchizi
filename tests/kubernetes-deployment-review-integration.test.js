import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/app/ArchitectureValidationPanel.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/architecture-validation.css", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/features/architecture/kubernetesDeploymentReviewHistory.js", import.meta.url), "utf8");
const remediation = readFileSync(new URL("../src/features/architecture/kubernetesRemediationChecklist.js", import.meta.url), "utf8");

 test("Architecture Validation panel is mounted in the existing application shell", () => {
  assert.match(app, /import ArchitectureValidationPanel from "\.\/components\/app\/ArchitectureValidationPanel"/);
  assert.match(app, /<ArchitectureValidationPanel[\s\S]*?validation=\{architectureValidation\}/);
  assert.match(app, /onSelectDiagnostic=\{selectArchitectureDiagnostic\}/);
  assert.match(app, /onApplyKubernetesSuggestion=\{applyKubernetesSuggestion\}/);
  assert.match(app, /canApplyCorrections=\{collaborationCanEdit\}/);
});

test("review dashboard keeps review state and remediation behind dedicated modules", () => {
  assert.match(panel, /loadKubernetesReviewHistory/);
  assert.match(panel, /saveKubernetesReviewSnapshot/);
  assert.match(panel, /deleteKubernetesReviewSnapshot/);
  assert.match(panel, /setKubernetesRemediationTaskStatus/);
  assert.match(panel, /window\.localStorage/);
  assert.match(history, /storage\?\.getItem/);
  assert.match(history, /storage\.setItem/);
  assert.match(remediation, /target\.getItem/);
  assert.match(remediation, /target\.setItem/);
});

test("review actions expose explicit user-facing status and empty states", () => {
  assert.match(panel, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(panel, /No saved review snapshots yet/);
  assert.match(panel, /No findings match the current comparison filters/);
  assert.match(panel, /No tasks match the current filters/);
});

test("review dashboard responsive and theme styles are imported by the feature", () => {
  assert.match(panel, /import "\.\.\/\.\.\/styles\/architecture-validation\.css"/);
  assert.match(styles, /\.app\.theme-dark/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /:focus-visible/);
});

test("review navigation respects reduced motion and targets existing sections", () => {
  assert.match(panel, /prefersReducedMotion \? "auto" : "smooth"/);
  for (const id of [
    "architecture-review-findings-panel",
    "architecture-remediation-checklist-panel",
    "architecture-review-history-panel",
    "architecture-review-comparison-panel",
  ]) assert.ok(panel.includes(`id="${id}"`), `missing review section ${id}`);
});

test("review export actions do not replace or export the diagram itself", () => {
  assert.match(panel, /Export review as Markdown/);
  assert.match(panel, /Export comparison as JSON/);
  assert.match(panel, /Export executive report as Markdown/);
  assert.match(panel, /not the diagram/);
});
