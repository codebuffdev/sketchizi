import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeReleaseFailure } from "../scripts/analyze-workbench-release-failure.mjs";

async function fixtureRoot({ stages, status = "not-passed", logPath, logText } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-release-analysis-"));
  await mkdir(path.join(root, "artifacts", "ci-logs"), { recursive: true });
  await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.json"), JSON.stringify({ status, stages: stages ?? [{ name: "Clean dependency install (npm ci)", outcome: "failure" }, { name: "Production build", outcome: "skipped" }] }));
  if (logPath) await writeFile(path.join(root, logPath), logText ?? "");
  return root;
}

test("classifies registry DNS failure and recommends environment-first remediation", async () => {
  const root = await fixtureRoot({ logPath: "artifacts/ci-logs/npm-ci.log", logText: "npm error EAI_AGAIN registry.npmjs.org" });
  try {
    const result = await analyzeReleaseFailure({ root, generatedAt: "2026-10-19T08:00:00.000Z" });
    assert.equal(result.report.analysisStatus, "actionable-evidence-found");
    assert.equal(result.report.firstActionableFailure.category, "environment-registry-or-network");
    assert.equal(result.report.firstActionableFailure.stage, "Clean dependency install (npm ci)");
    assert.match(result.markdown, /Check runner DNS\/proxy\/network access/);
    const persisted = JSON.parse(await readFile(result.jsonPath, "utf8"));
    assert.equal(persisted.releaseStatus, "not-passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("does not promote a skipped downstream stage over an earlier failed stage", async () => {
  const root = await fixtureRoot({ stages: [{ name: "Clean dependency install (npm ci)", outcome: "failure" }, { name: "Production build", outcome: "skipped" }], logPath: "artifacts/ci-logs/npm-ci.log", logText: "ERR_BLOCKED_BY_ADMINISTRATOR" });
  try {
    const { report } = await analyzeReleaseFailure({ root });
    assert.equal(report.firstActionableFailure.stage, "Clean dependency install (npm ci)");
    assert.equal(report.firstActionableFailure.category, "environment-policy-block");
    assert.equal(report.unsuccessfulStages.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reports missing or invalid release summaries as inconclusive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-release-analysis-empty-"));
  try {
    const { report } = await analyzeReleaseFailure({ root });
    assert.equal(report.analysisStatus, "inconclusive");
    assert.equal(report.summaryError, "release-summary-missing");
    assert.equal(report.firstActionableFailure, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("does not report a failure when all recorded release stages pass", async () => {
  const root = await fixtureRoot({ status: "passed", stages: [{ name: "Toolchain", outcome: "success" }] });
  try {
    const { report } = await analyzeReleaseFailure({ root });
    assert.equal(report.analysisStatus, "no-failure-detected");
    assert.equal(report.firstActionableFailure, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("historical diagnostic corpus classifies known failures without mislabeling app defects as environment issues", async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cases = JSON.parse(await readFile(path.join(testDirectory, "fixtures/workbench-release-failure-corpus/cases.json"), "utf8"));
  assert.ok(cases.length >= 8, "regression corpus should cover multiple release failure classes");
  for (const item of cases) {
    const root = await fixtureRoot({
      stages: [{ name: item.stage, outcome: item.outcome }],
      logPath: item.stage === "Clean dependency install (npm ci)" ? "artifacts/ci-logs/npm-ci.log"
        : item.stage === "Production build" ? "artifacts/ci-logs/production-build.log"
        : item.stage === "Workbench regression suites" ? "artifacts/ci-logs/workbench-regressions.log"
        : item.stage === "OpenAPI 3.1 external validation" ? "artifacts/ci-logs/openapi-validation.log"
        : item.stage === "Apply generated DDL to PostgreSQL and verify catalog objects" ? "artifacts/ci-logs/postgresql-execution-validation.log"
        : item.stage === "Rendered-browser persistence smoke" ? "artifacts/ci-logs/browser-smoke.log"
        : "artifacts/ci-logs/application-regressions.log",
      logText: item.log,
    });
    try {
      const { report } = await analyzeReleaseFailure({ root });
      assert.equal(report.firstActionableFailure?.category ?? "unclassified", item.expectedCategory, `${item.id}: category mismatch`);
      if (item.id === "application-runtime-defect") {
        assert.notEqual(report.firstActionableFailure?.category, "environment-registry-or-network");
        assert.notEqual(report.firstActionableFailure?.category, "environment-policy-block");
        assert.equal(report.firstActionableFailure?.category, "application-runtime-defect");
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("prioritizes the first failed stage in summary order even when a later log has a more recognizable error", async () => {
  const root = await fixtureRoot({ stages: [
    { name: "Application regression suites", outcome: "failure" },
    { name: "Clean dependency install (npm ci)", outcome: "failure" },
    { name: "Production build", outcome: "skipped" },
  ], logPath: "artifacts/ci-logs/npm-ci.log", logText: "EAI_AGAIN registry.npmjs.org" });
  try {
    await mkdir(path.join(root, "artifacts", "ci-logs"), { recursive: true });
    await writeFile(path.join(root, "artifacts/ci-logs/application-regressions.log"), "TypeError: Cannot read properties of undefined (reading 'scenarioId')");
    const { report } = await analyzeReleaseFailure({ root });
    assert.equal(report.firstActionableFailure.stage, "Application regression suites");
    assert.equal(report.firstActionableFailure.category, "application-runtime-defect");
  } finally { await rm(root, { recursive: true, force: true }); }
});
