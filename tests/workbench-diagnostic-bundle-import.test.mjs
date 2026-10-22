import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiagnosticBundle } from "../scripts/package-workbench-diagnostic-bundle.mjs";
import { inspectDiagnosticBundle } from "../scripts/inspect-workbench-release-diagnostic-bundle.mjs";

async function createSampleBundle(root, { corrupt = false } = {}) {
  const logs = path.join(root, "artifacts", "ci-logs");
  await mkdir(logs, { recursive: true });
  const summary = {
    status: "not-passed",
    generatedAt: "2026-10-19T08:00:00.000Z",
    stages: [
      { name: "Clean dependency install (npm ci)", outcome: "failure" },
      { name: "Production build", outcome: "skipped" },
    ],
  };
  await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.json"), `${JSON.stringify(summary)}\n`);
  await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.md"), "Release not passed\n");
  await writeFile(path.join(logs, "npm-ci.log"), "npm error code EAI_AGAIN registry.npmjs.org\n");
  await writeFile(path.join(logs, "production-build.log"), "Skipped because install failed\n");
  const packaged = await createDiagnosticBundle({ root, generatedAt: "2026-10-19T08:00:00.000Z" });
  if (corrupt) {
    const bytes = await readFile(packaged.bundlePath);
    bytes[0] ^= 0xff;
    await writeFile(packaged.bundlePath, bytes);
  }
  return packaged.bundlePath;
}

test("imports an intact CI bundle, verifies hashes, and analyzes the first failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-import-test-"));
  try {
    const bundlePath = await createSampleBundle(root);
    const result = await inspectDiagnosticBundle(bundlePath);
    assert.equal(result.verification.valid, true);
    assert.equal(result.verification.releaseStatus, "not-passed");
    assert.equal(result.analysis.firstActionableFailure.stage, "Clean dependency install (npm ci)");
    assert.equal(result.analysis.firstActionableFailure.category, "environment-registry-or-network");
    assert.match(await readFile(result.jsonPath, "utf8"), /"integrity"/);
    assert.match(await readFile(result.markdownPath, "utf8"), /Integrity:\*\* valid/);
    assert.equal(result.jsonPath.endsWith(".failure-analysis.json"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("refuses a corrupt CI bundle before writing analysis reports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-import-corrupt-"));
  try {
    const bundlePath = await createSampleBundle(root, { corrupt: true });
    await assert.rejects(inspectDiagnosticBundle(bundlePath), /integrity verification failed|ZIP end-of-central-directory|Invalid local header/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("does not turn a valid bundle from a failed release into a successful release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-import-failed-release-"));
  try {
    const bundlePath = await createSampleBundle(root);
    const result = await inspectDiagnosticBundle(bundlePath);
    assert.equal(result.verification.valid, true);
    assert.equal(result.verification.releaseStatus, "not-passed");
    assert.equal(result.report.integrity.releaseStatus, "not-passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
