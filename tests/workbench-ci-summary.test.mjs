import test from "node:test";
import assert from "node:assert/strict";
import { createGateSummary, renderMarkdown } from "../scripts/write-workbench-ci-summary.mjs";

const allSuccess = {
  TOOLCHAIN_OUTCOME: "success",
  REGISTRY_PROBE_TESTS_OUTCOME: "success",
  INSTALL_OUTCOME: "success",
  FONT_ASSETS_OUTCOME: "success",
  BUILD_OUTCOME: "success",
  APPLICATION_TESTS_OUTCOME: "success",
  WORKBENCH_TESTS_OUTCOME: "success",
  PLAYWRIGHT_INSTALL_OUTCOME: "success",
  CHROMIUM_INSTALL_OUTCOME: "success",
  BROWSER_SMOKE_OUTCOME: "success",
};

test("release summary passes only when every release-gate stage succeeds", () => {
  const summary = createGateSummary(allSuccess, "2026-10-18T00:00:00.000Z");
  assert.equal(summary.status, "passed");
  assert.equal(summary.stages.length, 10);
  assert.ok(summary.stages.every((stage) => stage.outcome === "success"));
  assert.equal(summary.firstNonSuccess, null);
});

test("a failed registry diagnostic test is reported before skipped installation", () => {
  const summary = createGateSummary({
    ...allSuccess,
    REGISTRY_PROBE_TESTS_OUTCOME: "failure",
    INSTALL_OUTCOME: "skipped",
    FONT_ASSETS_OUTCOME: "skipped",
    BUILD_OUTCOME: "skipped",
    APPLICATION_TESTS_OUTCOME: "skipped",
    WORKBENCH_TESTS_OUTCOME: "skipped",
    PLAYWRIGHT_INSTALL_OUTCOME: "skipped",
    CHROMIUM_INSTALL_OUTCOME: "skipped",
    BROWSER_SMOKE_OUTCOME: "skipped",
  });
  assert.equal(summary.status, "not-passed");
  assert.equal(summary.firstNonSuccess.name, "Registry diagnostic unit tests");
  assert.match(summary.firstNonSuccess.guidance, /npm-registry-probe-tests\.log/);
});

test("a failed install cannot be hidden by skipped downstream stages", () => {
  const summary = createGateSummary({
    ...allSuccess,
    INSTALL_OUTCOME: "failure",
    FONT_ASSETS_OUTCOME: "skipped",
    BUILD_OUTCOME: "skipped",
    APPLICATION_TESTS_OUTCOME: "skipped",
    WORKBENCH_TESTS_OUTCOME: "skipped",
    PLAYWRIGHT_INSTALL_OUTCOME: "skipped",
    CHROMIUM_INSTALL_OUTCOME: "skipped",
    BROWSER_SMOKE_OUTCOME: "skipped",
  });
  assert.equal(summary.status, "not-passed");
  assert.equal(summary.stages.find((stage) => stage.name.startsWith("Clean dependency install")).outcome, "failure");
  assert.equal(summary.firstNonSuccess.name, "Clean dependency install (npm ci)");
  assert.match(renderMarkdown(summary), /Overall status:\*\* NOT PASSED/);
  assert.match(renderMarkdown(summary), /npm-registry-probe\.log/);
  assert.match(renderMarkdown(summary), /package-lock consistency/);
});

test("missing outcome inputs are reported as unknown, not assumed successful", () => {
  const summary = createGateSummary({}, "2026-10-18T00:00:00.000Z");
  assert.equal(summary.status, "not-passed");
  assert.ok(summary.stages.every((stage) => stage.outcome === "unknown"));
  assert.equal(summary.firstNonSuccess.outcome, "unknown");
});

test("summary states the boundaries of the browser smoke and calibration claims", () => {
  const markdown = renderMarkdown(createGateSummary(allSuccess, "2026-10-18T00:00:00.000Z"));
  assert.match(markdown, /not a full end-to-end test/);
  assert.match(markdown, /real customer k6\/JMeter exports/);
  assert.match(markdown, /workbench-release-gate-diagnostics/);
  assert.match(markdown, /Excalidraw package and font assets/);
});

test("summary includes GitHub workflow metadata and a safely constructed run URL", () => {
  const summary = createGateSummary({
    ...allSuccess,
    GITHUB_REPOSITORY: "example/sketchizi",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: "abc123def456",
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_SERVER_URL: "https://github.com/",
  });
  assert.equal(summary.context.repository, "example/sketchizi");
  assert.equal(summary.context.ref, "refs/heads/main");
  assert.equal(summary.context.sha, "abc123def456");
  assert.equal(summary.context.runUrl, "https://github.com/example/sketchizi/actions/runs/12345");
  assert.match(renderMarkdown(summary), /\*\*Run attempt:\*\* 2/);
  assert.match(renderMarkdown(summary), /https:\/\/github\.com\/example\/sketchizi\/actions\/runs\/12345/);
});

test("run URL is omitted when repository or run identifier is malformed", () => {
  const summary = createGateSummary({ ...allSuccess, GITHUB_REPOSITORY: "bad value", GITHUB_RUN_ID: "abc" });
  assert.equal(summary.context.runUrl, null);
});

test("a failed non-blocking registry probe is surfaced without overriding gate outcome", () => {
  const summary = createGateSummary({ ...allSuccess, REGISTRY_PROBE_OUTCOME: "failure" }, "2026-10-18T00:00:00.000Z");
  assert.equal(summary.status, "passed");
  assert.equal(summary.registryDiagnostics.outcome, "failure");
  assert.equal(summary.registryDiagnostics.blocking, false);
  const markdown = renderMarkdown(summary);
  assert.match(markdown, /Registry connectivity diagnostic \(non-blocking\)/);
  assert.match(markdown, /npm-registry-probe\.json/);
  assert.match(markdown, /npm ci remains the authoritative install gate|actual install result/);
});
