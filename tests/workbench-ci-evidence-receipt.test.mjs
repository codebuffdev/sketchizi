import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCiEvidenceReceipt } from "../scripts/write-workbench-ci-evidence-receipt.mjs";
import { verifyCiEvidenceReceipt } from "../scripts/verify-workbench-ci-evidence-receipt.mjs";
import { createDiagnosticBundle, createZip } from "../scripts/package-workbench-diagnostic-bundle.mjs";
import { inspectDiagnosticBundle } from "../scripts/inspect-workbench-release-diagnostic-bundle.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-receipt-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundlePath = path.join(root, "workbench-release-diagnostic-bundle.zip");
  const payloads = [
    { name: "artifacts/workbench-release-gate-summary.json", data: Buffer.from('{"status":"not-passed"}\n') },
    { name: "artifacts/ci-logs/toolchain.log", data: Buffer.from("node v22\n") },
  ];
  const manifest = {
    schemaVersion: 1,
    bundleType: "sketchizi-workbench-release-diagnostics",
    generatedAt: "2026-10-19T12:00:00.000Z",
    releaseStatus: "not-passed",
    completeness: { complete: false, missingRequiredArtifacts: [] },
    files: payloads.map((entry) => ({ path: entry.name, bytes: entry.data.length, sha256: createHash("sha256").update(entry.data).digest("hex") })),
  };
  const bundleBytes = createZip([...payloads, { name: "workbench-release-diagnostic-manifest.json", data: Buffer.from(JSON.stringify(manifest) + "\n") }], new Date("2026-10-19T12:00:00.000Z"));
  await writeFile(bundlePath, bundleBytes);
  await writeFile(path.join(root, "workbench-release-diagnostic-bundle.failure-analysis.json"), JSON.stringify({
    sourceBundle: "workbench-release-diagnostic-bundle.zip",
    integrity: { valid: true, checkedFiles: 2, warnings: [], releaseStatus: "not-passed" },
    analysis: { analysisStatus: "actionable-failure-found" },
  }));
  await writeFile(path.join(root, "workbench-release-diagnostic-bundle.failure-analysis.md"), "# analysis\n");
  const metadataPath = path.join(root, "workbench-ci-run-metadata.json");
  await writeFile(metadataPath, JSON.stringify({
    schemaVersion: 1,
    collectedAt: "2026-10-19T12:00:00.000Z",
    requestedRef: "main",
    localHead: "a".repeat(40),
    run: {
      id: 123456,
      url: "https://github.com/example/sketchizi/actions/runs/123456",
      workflowName: "Workbench release gate",
      status: "completed",
      conclusion: "failure",
      headSha: "a".repeat(40),
      headBranch: "main",
      event: "workflow_dispatch",
    },
  }));
  return { root, bundlePath, bundleBytes, metadataPath };
}

test("receipt binds an identity-verified CI run to the diagnostic bundle SHA-256", async (t) => {
  const f = await fixture(t);
  const result = await createCiEvidenceReceipt(f);
  assert.equal(result.receipt.run.id, 123456);
  assert.equal(result.receipt.run.conclusion, "failure", "receipt must preserve a failed CI conclusion");
  assert.equal(result.receipt.diagnosticBundle.sha256, createHash("sha256").update(f.bundleBytes).digest("hex"));
  assert.equal(result.receipt.integrity.valid, true);
  assert.equal(result.receipt.integrity.checkedFiles, 2);
  assert.match(await readFile(result.markdownPath, "utf8"), /Recorded|Conclusion|failure/);
  assert.equal(JSON.parse(await readFile(result.jsonPath, "utf8")).diagnosticBundle.filename, "workbench-release-diagnostic-bundle.zip");
  const verified = await verifyCiEvidenceReceipt({ receiptPath: result.jsonPath, bundlePath: f.bundlePath });
  assert.equal(verified.valid, true);
  assert.equal(verified.runId, 123456);
  assert.equal(verified.conclusion, "failure", "receipt verification must not turn a failed run into a pass");
});


test("receipt independently rejects a corrupted ZIP even if adjacent analysis claims it was valid", async (t) => {
  const f = await fixture(t);
  const bytes = await readFile(f.bundlePath);
  bytes[0] ^= 0xff;
  await writeFile(f.bundlePath, bytes);
  await assert.rejects(() => createCiEvidenceReceipt(f), /cannot be verified independently|integrity verification failed/);
});

test("receipt rejects a run from a different commit before writing the receipt", async (t) => {
  const f = await fixture(t);
  const metadata = JSON.parse(await readFile(f.metadataPath, "utf8"));
  metadata.run.headSha = "b".repeat(40);
  await writeFile(f.metadataPath, JSON.stringify(metadata));
  await assert.rejects(() => createCiEvidenceReceipt(f), /does not match the intended local HEAD/);
});

test("receipt rejects unrelated workflow, mismatched branch, and incomplete run metadata", async (t) => {
  for (const [field, value, expected] of [
    ["workflowName", "Other workflow", /Unexpected workflow/],
    ["headBranch", "feature/other", /does not match requested ref/],
    ["status", "in_progress", /is not completed/],
    ["conclusion", "mystery", /Unrecognized run conclusion/],
  ]) {
    const f = await fixture(t);
    const metadata = JSON.parse(await readFile(f.metadataPath, "utf8"));
    metadata.run[field] = value;
    await writeFile(f.metadataPath, JSON.stringify(metadata));
    await assert.rejects(() => createCiEvidenceReceipt(f), expected, `should reject ${field}`);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("receipt rejects an analysis report that does not bind valid integrity to this bundle", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "workbench-release-diagnostic-bundle.failure-analysis.json"), JSON.stringify({
    sourceBundle: "some-other.zip", integrity: { valid: false, checkedFiles: 0 },
  }));
  await assert.rejects(() => createCiEvidenceReceipt(f), /references a different source bundle/);
});

test("receipt rejects insecure run URLs and unexpected bundle names", async (t) => {
  const f = await fixture(t);
  const metadata = JSON.parse(await readFile(f.metadataPath, "utf8"));
  metadata.run.url = "http://github.com/example/sketchizi/actions/runs/123456";
  await writeFile(f.metadataPath, JSON.stringify(metadata));
  await assert.rejects(() => createCiEvidenceReceipt(f), /must use HTTPS/);
  metadata.run.url = "https://github.com/example/sketchizi/actions/runs/123456";
  await writeFile(f.metadataPath, JSON.stringify(metadata));
  const renamed = path.join(f.root, "wrong-bundle.zip");
  await writeFile(renamed, f.bundleBytes);
  await assert.rejects(() => createCiEvidenceReceipt({ ...f, bundlePath: renamed }), /Unexpected diagnostic bundle name/);
});


test("receipt integrates with an actual packaged and integrity-verified diagnostic ZIP", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-receipt-integration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = path.join(root, "artifacts");
  await mkdir(path.join(artifacts, "ci-logs"), { recursive: true });
  await writeFile(path.join(artifacts, "workbench-release-gate-summary.json"), JSON.stringify({
    status: "not-passed",
    generatedAt: "2026-10-19T12:00:00.000Z",
    stages: [
      { name: "Clean dependency install (npm ci)", outcome: "failure" },
      { name: "Production build", outcome: "skipped" },
    ],
  }));
  await writeFile(path.join(artifacts, "workbench-release-gate-summary.md"), "Release not passed\n");
  await writeFile(path.join(artifacts, "ci-logs", "npm-ci.log"), "npm error code EAI_AGAIN registry.npmjs.org\n");
  await writeFile(path.join(artifacts, "ci-logs", "production-build.log"), "Skipped after install failure\n");

  const packed = await createDiagnosticBundle({ root, generatedAt: "2026-10-19T12:00:00.000Z" });
  const inspection = await inspectDiagnosticBundle(packed.bundlePath);
  assert.equal(inspection.verification.valid, true);
  const metadataPath = path.join(artifacts, "workbench-ci-run-metadata.json");
  await writeFile(metadataPath, JSON.stringify({
    schemaVersion: 1,
    collectedAt: "2026-10-19T12:01:00.000Z",
    requestedRef: "main",
    localHead: "a".repeat(40),
    run: {
      id: 123456,
      url: "https://github.com/example/sketchizi/actions/runs/123456",
      workflowName: "Workbench release gate",
      status: "completed",
      conclusion: "failure",
      headSha: "a".repeat(40),
      headBranch: "main",
      event: "workflow_dispatch",
    },
  }));
  const result = await createCiEvidenceReceipt({ metadataPath, bundlePath: packed.bundlePath });
  assert.equal(result.receipt.integrity.valid, true);
  assert.equal(result.receipt.run.conclusion, "failure");
  assert.equal(result.receipt.diagnosticBundle.sha256, createHash("sha256").update(await readFile(packed.bundlePath)).digest("hex"));
  assert.equal(result.receipt.analysisReports.analysisStatus, "actionable-evidence-found");
});


test("receipt verifier rejects diagnostic ZIP tampering after receipt creation", async (t) => {
  const f = await fixture(t);
  const result = await createCiEvidenceReceipt(f);
  const bytes = await readFile(f.bundlePath);
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(f.bundlePath, bytes);
  await assert.rejects(() => verifyCiEvidenceReceipt({ receiptPath: result.jsonPath, bundlePath: f.bundlePath }), /byte count|SHA-256|cannot be independently verified|integrity verification failed/);
});

test("receipt verifier rejects edited run metadata and invalid release-status summaries", async (t) => {
  const f = await fixture(t);
  const result = await createCiEvidenceReceipt(f);
  const receipt = JSON.parse(await readFile(result.jsonPath, "utf8"));
  receipt.run.conclusion = "success";
  await writeFile(result.jsonPath, JSON.stringify(receipt));
  await assert.rejects(() => verifyCiEvidenceReceipt({ receiptPath: result.jsonPath, bundlePath: f.bundlePath }), /recorded release status|collection metadata|unrecognized run conclusion|CI reports success/);
});
