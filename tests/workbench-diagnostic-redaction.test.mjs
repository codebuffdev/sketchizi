import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { redactDiagnosticText, shouldRedactDiagnosticPath } from "../scripts/redact-workbench-diagnostic-secrets.mjs";
import { createDiagnosticBundle } from "../scripts/package-workbench-diagnostic-bundle.mjs";

function zipEntry(zip, wantedName) {
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    if (name === wantedName) return (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
    offset = dataStart + compressedSize;
  }
  return null;
}

test("redacts authorization headers, common key assignments, tokens, and credentialed URLs", () => {
  const source = [
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.very-secret-token",
    "GEMINI_API_KEY=AIzaSyExampleSecretValue",
    "access_token=abcdef0123456789",
    "ghp_abcdefghijklmnopqrstuvwxyz012345",
    "postgresql://app:super-secret-password@db.example.test:5432/app",
    "https://user:password@example.test/path",
  ].join("\n");
  const result = redactDiagnosticText(source);
  assert.doesNotMatch(result, /very-secret-token|AIzaSyExampleSecretValue|abcdef0123456789|ghp_abcdefghijklmnopqrstuvwxyz012345|super-secret-password|user:password/);
  assert.match(result, /\[REDACTED\]/);
});

test("redaction is limited to diagnostic logs and failure-analysis reports", () => {
  assert.equal(shouldRedactDiagnosticPath("artifacts/ci-logs/npm-ci.log"), true);
  assert.equal(shouldRedactDiagnosticPath("artifacts/workbench-release-failure-analysis.json"), true);
  assert.equal(shouldRedactDiagnosticPath("artifacts/generated/schema.sql"), false);
});

test("diagnostic bundle redacts log copies, records the sanitized hash, and preserves local logs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-redaction-"));
  const secretLog = "npm error Authorization: Bearer example-super-secret-token-123456\napi_key=super-secret-api-key\n";
  try {
    await mkdir(path.join(root, "artifacts", "ci-logs"), { recursive: true });
    await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.json"), JSON.stringify({ status: "not-passed", stages: [{ name: "Clean dependency install (npm ci)", outcome: "failure" }] }));
    await writeFile(path.join(root, "artifacts", "ci-logs", "npm-ci.log"), secretLog);
    const result = await createDiagnosticBundle({ root, generatedAt: "2026-10-19T08:00:00.000Z" });
    const original = await readFile(path.join(root, "artifacts", "ci-logs", "npm-ci.log"), "utf8");
    assert.equal(original, secretLog, "source log must not be modified");
    const zip = await readFile(result.bundlePath);
    const bundledLog = zipEntry(zip, "artifacts/ci-logs/npm-ci.log");
    assert.ok(bundledLog);
    assert.doesNotMatch(bundledLog, /example-super-secret-token-123456|super-secret-api-key/);
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    const logEntry = manifest.files.find((file) => file.path === "artifacts/ci-logs/npm-ci.log");
    assert.equal(logEntry.redactedForSharing, true);
    assert.equal(logEntry.sha256, (await import("node:crypto")).createHash("sha256").update(bundledLog).digest("hex"));
    assert.equal(manifest.releaseStatus, "not-passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
