import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiagnosticBundle, createZip } from "../scripts/package-workbench-diagnostic-bundle.mjs";
import { readDiagnosticZip, verifyDiagnosticBundle, verifyDiagnosticBundleAndWriteReport, verifyDiagnosticBundleEntries } from "../scripts/verify-workbench-diagnostic-bundle.mjs";

const manifestPath = "workbench-release-diagnostic-manifest.json";
const samplePath = "artifacts/ci-logs/build.log";
const sample = Buffer.from("build passed\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function makeEntries({ data = sample, hashData = data, includeManifest = true, extra = [], status = "passed" } = {}) {
  const manifest = {
    schemaVersion: 1,
    bundleType: "sketchizi-workbench-release-diagnostics",
    generatedAt: "2026-10-19T08:00:00.000Z",
    releaseStatus: status,
    completeness: { complete: true, missingRequiredArtifacts: [] },
    files: [{ path: samplePath, bytes: hashData.length, sha256: sha256(hashData) }],
  };
  const entries = [{ name: samplePath, data }, ...extra];
  if (includeManifest) entries.push({ name: manifestPath, data: JSON.stringify(manifest) });
  return entries;
}

test("verifies an intact bundle and checks manifest hashes", () => {
  const entries = readDiagnosticZip(createZip(makeEntries()));
  const result = verifyDiagnosticBundleEntries(entries);
  assert.equal(result.valid, true);
  assert.equal(result.checkedFiles, 1);
  assert.equal(result.releaseStatus, "passed");
  assert.deepEqual(result.errors, []);
});

test("detects changed file bytes using the manifest SHA-256", () => {
  const entries = readDiagnosticZip(createZip(makeEntries({ data: Buffer.from("tampered\n"), hashData: sample })));
  const result = verifyDiagnosticBundleEntries(entries);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("SHA-256 mismatch")));
});

test("detects missing manifest entries and unexpected ZIP entries", () => {
  const expected = makeEntries();
  expected.splice(0, 1);
  expected.push({ name: "artifacts/unlisted.txt", data: "unexpected" });
  const result = verifyDiagnosticBundleEntries(readDiagnosticZip(createZip(expected)));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Manifest file is missing")));
  assert.ok(result.errors.some((error) => error.includes("Unexpected ZIP entry")));
});

test("reports missing or malformed embedded manifests as invalid", () => {
  const missing = verifyDiagnosticBundleEntries(readDiagnosticZip(createZip(makeEntries({ includeManifest: false }))));
  assert.equal(missing.valid, false);
  assert.match(missing.errors[0], /manifest is missing/i);
  const malformed = verifyDiagnosticBundleEntries(new Map([[manifestPath, Buffer.from("{")]]));
  assert.equal(malformed.valid, false);
  assert.match(malformed.errors[0], /valid JSON/i);
});

test("does not confuse integrity with a passing release verdict", () => {
  const result = verifyDiagnosticBundleEntries(readDiagnosticZip(createZip(makeEntries({ status: "failed" }))));
  assert.equal(result.valid, true);
  assert.equal(result.releaseStatus, "failed");
  assert.ok(result.warnings.some((warning) => warning.includes("does not imply release success")));
});

test("validates a bundle from a filesystem path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-bundle-verify-"));
  const bundlePath = path.join(root, "diagnostics.zip");
  try {
    await writeFile(bundlePath, createZip(makeEntries()));
    const result = await verifyDiagnosticBundle(bundlePath);
    assert.equal(result.valid, true);
    assert.equal(result.archiveBytes > 0, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects corrupt ZIP input instead of reporting a valid bundle", () => {
  assert.throws(() => readDiagnosticZip(Buffer.from("not a zip")), /end-of-central-directory/i);
});


test("writes a machine-readable passing verification report without changing the recorded release status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-bundle-report-"));
  const bundlePath = path.join(root, "diagnostics.zip");
  const reportPath = path.join(root, "verification.json");
  try {
    await writeFile(bundlePath, createZip(makeEntries({ status: "failed" })));
    const result = await verifyDiagnosticBundleAndWriteReport(bundlePath, reportPath);
    const saved = JSON.parse(await (await import("node:fs/promises")).readFile(reportPath, "utf8"));
    assert.equal(result.verificationStatus, "passed");
    assert.equal(saved.integrityValid, true);
    assert.equal(saved.releaseStatus, "failed");
    assert.equal(saved.verificationStatus, "passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("writes a failed verification report when the archive is corrupt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-bundle-report-invalid-"));
  const bundlePath = path.join(root, "diagnostics.zip");
  const reportPath = path.join(root, "verification.json");
  try {
    await writeFile(bundlePath, "not a zip");
    const result = await verifyDiagnosticBundleAndWriteReport(bundlePath, reportPath);
    const saved = JSON.parse(await (await import("node:fs/promises")).readFile(reportPath, "utf8"));
    assert.equal(result.verificationStatus, "failed");
    assert.equal(saved.integrityValid, false);
    assert.match(saved.errors[0], /end-of-central-directory/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("verifies the actual archive produced by the diagnostic packager", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-real-bundle-"));
  try {
    const artifacts = path.join(root, "artifacts");
    await (await import("node:fs/promises")).mkdir(path.join(artifacts, "ci-logs"), { recursive: true });
    await writeFile(path.join(artifacts, "workbench-release-gate-summary.json"), JSON.stringify({ status: "not-passed", stages: [] }));
    await writeFile(path.join(artifacts, "workbench-release-gate-summary.md"), "Release not passed\n");
    await writeFile(path.join(artifacts, "ci-logs", "build.log"), "build unavailable\n");
    const packaged = await createDiagnosticBundle({ root, generatedAt: "2026-10-19T08:00:00.000Z" });
    const verified = await verifyDiagnosticBundle(packaged.bundlePath);
    assert.equal(verified.valid, true);
    assert.equal(verified.releaseStatus, "not-passed");
    assert.equal(verified.checkedFiles >= 3, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
